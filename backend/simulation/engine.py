import heapq
import random
from dataclasses import dataclass
from .models import SimConfig, Timer

from .events import (
    KIND_CONTROL,
    KIND_DATA,
    NODE_LOG,
    PACKET_DELIVERED,
    PACKET_DROPPED,
    PACKET_RECV,
    PACKET_SENT,
    TABLE_UPDATE,
    SimEvent,
)
from .packet import Packet

@dataclass
class _Arrival:
    packet: Packet
    node_id: int
    link_id: int | None      # None for local injections (ping start, echo reply)
    from_id: int | None


class SimContext:
    """The only API an algorithm may use (design doc §5).

    Everything an algorithm does — moving packets, scheduling timers, keeping
    per-node state, informing the UI — goes through this object, never through
    the engine, the queue or the real device model.
    """

    def __init__(self, engine):
        self._engine = engine

    @property
    def now(self):
        return self._engine.now

    @property
    def net(self):
        return self._engine.snapshot

    @property
    def rng(self):
        """Seeded RNG — the only randomness source, so runs are replayable."""
        return self._engine.rng

    def forward(self, node, packet, adj):
        """Send ``packet`` out of ``node`` over adjacency ``adj``.

        It arrives at ``adj.neighbor_id`` after ``adj.delay`` ms. The engine
        decrements TTL of data packets here and drops them when it expires.
        """
        self._engine._transmit(node.id, packet, adj)

    def send_control(self, node, protocol, payload, adj):
        """Emit a control-plane packet (hello/LSA/DV...) to one neighbor."""
        packet = Packet(
            id=self._engine._next_packet_id(),
            kind=KIND_CONTROL,
            protocol=protocol,
            src_id=node.id,
            dst_id=adj.neighbor_id,
            ttl=1,
            meta={"payload": payload},
        )
        self._engine._transmit(node.id, packet, adj)

    def drop(self, node, packet, reason):
        self._engine._drop(node.id, packet, reason)

    def schedule_timer(self, node, delay, name, payload=None):
        self._engine._schedule_timer(node.id, delay, name, payload or {})

    def state(self, node):
        """Private per-node scratch dict for the algorithm (LSDB, counters...)."""
        return self._engine._algo_state.setdefault(node.id, {})

    def table_update(self, node, rows):
        """Publish a node's learned routing table to the UI (no model writes)."""
        self._engine._emit(TABLE_UPDATE, node_id=node.id, payload={"routes": rows})

    def log(self, node, message):
        self._engine._emit(NODE_LOG, node_id=node.id, payload={"message": str(message)})


class SimulationEngine:
    """Interactive discrete-event simulation core (design doc §6).

    The engine is a passive, synchronous state machine — it has no clock of
    its own and knows nothing about WebSockets or wall time:

        start()                  -> control-plane warm-up (algorithm.on_init)
        peek_time()              -> sim time of the next queued event, or None
        advance()                -> process exactly one queue entry, return the
                                    SimEvents it produced
        inject_ping(src, dst, t) -> drop an ICMP request into the running world

    The session layer decides *when* to call advance() (mapping sim time to
    wall time / speed); tests just loop advance() to fast-forward. Delivered
    ICMP requests automatically trigger an echo reply routed back by the same
    algorithm, so a successful ping ends with the reply delivered at the
    original source, carrying the RTT.
    """

    def __init__(self, snapshot, algorithm, config=None):
        self.snapshot = snapshot
        self.algorithm = algorithm
        self.config = config or SimConfig()
        self.rng = random.Random(self.config.seed)

        self.now = 0.0
        self.limit_hit = None      # "max_events" once the safety rail trips

        self._queue = []           # heap of (t, push_seq, _Arrival | Timer)
        self._push_seq = 0         # FIFO tiebreak for same-t entries
        self._pending = []         # SimEvents produced by the current handler
        self._emitted = 0
        self._packet_seq = 0
        self._algo_state = {}
        self._ctx = SimContext(self)

    # ----------------------------------------------------------- public API
    def start(self):
        """Run the algorithm's control-plane warm-up; returns its events."""
        self.algorithm.on_init(self._ctx)
        return self._collect()

    def peek_time(self):
        """Sim time of the earliest queued entry, or None when idle."""
        if self.limit_hit or not self._queue:
            return None
        return self._queue[0][0]

    def advance(self):
        """Process exactly one queue entry; returns the SimEvents it emitted."""
        if self.limit_hit or not self._queue:
            return []
        t, _, entry = heapq.heappop(self._queue)
        self.now = max(self.now, t)

        if isinstance(entry, _Arrival):
            self._handle_arrival(entry)
        else:
            node = self.snapshot.node(entry.node_id)
            if node is not None:
                self.algorithm.on_timer(self._ctx, node, entry)

        events = self._collect()
        if self._emitted >= self.config.max_events:
            self.limit_hit = "max_events"
        return events

    def inject_packet(self, source_id, curr_time, packet):
        """Schedule a packet source→target at sim time ``at_time``."""
        self._push(curr_time, _Arrival(packet, source_id, None, None))
        return packet.id

    def summary(self):
        return {"sim_time": self.now, "events": self._emitted}

    # ------------------------------------------------------- event dispatch
    def _handle_arrival(self, entry):
        node = self.snapshot.node(entry.node_id)
        if node is None:
            return
        packet = entry.packet

        if entry.link_id is not None:
            self._emit(
                PACKET_RECV,
                kind=packet.kind,
                packet_id=packet.id,
                protocol=packet.protocol,
                from_id=entry.from_id,
                to_id=node.id,
                link_id=entry.link_id,
                payload={"ttl": packet.ttl},
            )

        # The engine only auto-delivers data packets; control packets always
        # belong to the algorithm, whatever their addressing.
        if packet.kind == KIND_DATA and self._is_delivered(node, packet):
            self.algorithm.on_deliver(self._ctx, node, packet)
            self._deliver(node, packet)
            return

        self.algorithm.on_packet(self._ctx, node, packet)

    def _deliver(self, node, packet):
        icmp = packet.meta.get("icmp")
        payload = {"ttl": packet.ttl, "src_id": packet.src_id}
        if icmp:
            payload["icmp"] = icmp
        created = packet.meta.get("created_t")
        if created is not None:
            payload["elapsed"] = self.now - created
        if icmp == "reply":
            payload["request_id"] = packet.meta.get("request_id")
            request_created = packet.meta.get("request_created_t")
            if request_created is not None:
                payload["rtt"] = self.now - request_created

        self._emit(
            PACKET_DELIVERED,
            kind=packet.kind,
            packet_id=packet.id,
            protocol=packet.protocol,
            node_id=node.id,
            payload=payload,
        )

        # Real ICMP: the destination answers, and the reply has to find its
        # own way back through the same algorithm (a random walk wanders home).
        if icmp == "request":
            reply = Packet.create_ping_packet(
                packet_id=self._next_packet_id(),
                src_id=node.id,
                dst_id=packet.src_id,
                dst_ip=self.snapshot.first_ip(packet.src_id),
                ttl=self.config.ttl,
                time=self.now,
                icmp_type="reply",
                request_id=packet.id,
                request_created_t=packet.meta.get("created_t")
            )
            self._push(self.now, _Arrival(reply, node.id, None, None))

    def _is_delivered(self, node, packet):
        if packet.dst_id is not None and node.id == packet.dst_id:
            return True
        return bool(packet.dst_ip) and node.has_ip(packet.dst_ip)

    # ------------------------------------------------- SimContext plumbing
    def _transmit(self, node_id, packet, adj):
        if packet.kind == KIND_DATA:
            packet.ttl -= 1
            if packet.ttl <= 0:
                self._drop(node_id, packet, "ttl_expired")
                return
        packet.meta["prev_node"] = node_id

        payload = {"ttl": packet.ttl}
        icmp = packet.meta.get("icmp")
        if icmp:
            payload["icmp"] = icmp

        self._emit(
            PACKET_SENT,
            kind=packet.kind,
            packet_id=packet.id,
            protocol=packet.protocol,
            from_id=node_id,
            to_id=adj.neighbor_id,
            link_id=adj.link_id,
            payload=payload,
        )
        self._push(self.now + adj.delay, _Arrival(packet, adj.neighbor_id, adj.link_id, node_id))

    def _drop(self, node_id, packet, reason):
        payload = {"reason": reason}
        icmp = packet.meta.get("icmp")
        if icmp:
            payload["icmp"] = icmp
        self._emit(
            PACKET_DROPPED,
            kind=packet.kind,
            packet_id=packet.id,
            protocol=packet.protocol,
            node_id=node_id,
            payload=payload,
        )

    def _schedule_timer(self, node_id, delay, name, payload):
        self._push(self.now + delay, Timer(node_id=node_id, name=name, payload=payload))

    # ----------------------------------------------------------- low level
    def _push(self, t, entry):
        heapq.heappush(self._queue, (t, self._push_seq, entry))
        self._push_seq += 1

    def _emit(self, event_type, **fields):
        self._emitted += 1
        self._pending.append(SimEvent(seq=self._emitted, t=self.now, type=event_type, **fields))

    def _collect(self):
        events, self._pending = self._pending, []
        return events

    def _next_packet_id(self):
        self._packet_seq += 1
        return f"p{self._packet_seq}"

    def disconnect_link(self, link_id):
        if not self.snapshot.disconnect_link(link_id):
            return

        retained = []

        for item in self._queue:
            arrival = item[-1]
            if isinstance(arrival, _Arrival) and arrival.link_id == link_id:
                payload = {"reason": "link_disconnected"}
                icmp = arrival.packet.meta.get("icmp")
                if icmp:
                    payload["icmp"] = icmp

                self._emit(
                    PACKET_DROPPED,
                    kind=arrival.packet.kind,
                    packet_id=arrival.packet.id,
                    protocol=arrival.packet.protocol,
                    from_id=arrival.from_id,
                    to_id=arrival.node_id,
                    link_id=link_id,
                    payload=payload,
                )
            else:
                retained.append(item)

        self._queue = retained
        heapq.heapify(self._queue)
        return self._collect()

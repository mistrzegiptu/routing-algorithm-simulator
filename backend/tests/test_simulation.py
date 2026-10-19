"""Engine + random walk tests.

The engine is a passive state machine, so tests fast-forward by looping
``advance()`` — no wall clock, no WebSockets. Every run with a fixed seed is
fully deterministic (design decision #5).

Run inside Docker:
    docker compose run --rm --no-deps backend python -m pytest tests -q
"""

from objects.computer import Computer
from objects.router import Router
from simulation.algorithm import RoutingAlgorithm
from simulation.engine import SimConfig, SimulationEngine
from simulation.registry import get_algorithm
from simulation.snapshot import NetworkSnapshot
from simulation.packet import Packet


def inject_ping(engine, source_id, target_id, at_time=0.0):
    packet = Packet.create_ping_packet(
        packet_id="test-ping",
        src_id=source_id,
        dst_id=target_id,
        dst_ip=engine.snapshot.first_ip(target_id),
        ttl=engine.config.ttl,
        time=at_time,
    )
    return engine.inject_packet(source_id, at_time, packet)


def link(a, b, delay):
    return a.add_link(b, a.allocate_link_port(), b.allocate_link_port(), 100, delay, "Mbps")


def line_topology():
    """PC1 --10ms-- R1 --5ms-- PC2"""
    pc1, r1, pc2 = Computer(id=1, name="PC1"), Router(id=2, name="R1"), Computer(id=3, name="PC2")
    links = [link(pc1, r1, 10), link(r1, pc2, 5)]
    return [pc1, r1, pc2], links


def diamond_topology():
    """PC1 - R1 - (R2 | R3) - R4 - PC2, all links 10 ms."""
    pc1, pc2 = Computer(id=1, name="PC1"), Computer(id=6, name="PC2")
    r1, r2, r3, r4 = (Router(id=i, name=f"R{i}") for i in range(2, 6))
    links = [
        link(pc1, r1, 10),
        link(r1, r2, 10), link(r1, r3, 10),
        link(r2, r4, 10), link(r3, r4, 10),
        link(r4, pc2, 10),
    ]
    return [pc1, r1, r2, r3, r4, pc2], links


def make_engine(devices, links, algorithm, **config_kwargs):
    snapshot = NetworkSnapshot.from_db(devices, links)
    engine = SimulationEngine(snapshot, algorithm, SimConfig(**config_kwargs))
    engine.start()  # trivial algorithms have no control plane → no events
    return engine


def drain(engine):
    """Fast-forward: process every queued event, return the full timeline."""
    events = []
    while engine.peek_time() is not None:
        events += engine.advance()
    return events


def by_type(events, event_type):
    return [e for e in events if e.type == event_type]


class FirstNeighbor(RoutingAlgorithm):
    """Deterministic test dummy: always the first non-backtracking adjacency."""

    name = "first_neighbor_test"

    def on_packet(self, ctx, node, packet):
        options = ctx.net.neighbors(node.id)
        prev = packet.meta.get("prev_node")
        candidates = [a for a in options if a.neighbor_id != prev] or options
        if not candidates:
            return ctx.drop(node, packet, "dead_end")
        ctx.forward(node, packet, candidates[0])


# --------------------------------------------------------------- engine core

def test_ping_request_and_reply_on_line():
    devices, links = line_topology()
    pc1, _, pc2 = devices
    engine = make_engine(devices, links, FirstNeighbor())

    inject_ping(engine, pc1.id, pc2.id, at_time=0.0)
    events = drain(engine)

    delivered = by_type(events, "packet_delivered")
    assert [d.payload["icmp"] for d in delivered] == ["request", "reply"]

    request, reply = delivered
    assert request.node_id == pc2.id and request.t == 15.0
    assert reply.node_id == pc1.id and reply.t == 30.0
    assert reply.payload["rtt"] == 30.0
    assert reply.payload["request_id"] == request.packet_id
    assert request.payload.get("ping_id") == request.packet_id
    assert reply.payload.get("ping_id") == request.packet_id


def test_sent_recv_pairs_carry_link_delay():
    devices, links = line_topology()
    pc1, _, pc2 = devices
    engine = make_engine(devices, links, FirstNeighbor())
    inject_ping(engine, pc1.id, pc2.id, at_time=0.0)
    events = drain(engine)

    recv_t = {(e.packet_id, e.link_id, e.to_id): e.t for e in by_type(events, "packet_recv")}
    for sent in by_type(events, "packet_sent"):
        delay = engine.snapshot.links[sent.link_id].delay
        assert recv_t[(sent.packet_id, sent.link_id, sent.to_id)] == sent.t + delay


def test_ping_injected_mid_run_uses_given_sim_time():
    devices, links = line_topology()
    pc1, _, pc2 = devices
    engine = make_engine(devices, links, FirstNeighbor())

    inject_ping(engine, pc1.id, pc2.id, at_time=5000.0)
    events = drain(engine)

    assert by_type(events, "packet_sent")[0].t == 5000.0
    reply = by_type(events, "packet_delivered")[-1]
    assert reply.payload["rtt"] == 30.0  # RTT independent of injection time


def test_ttl_expiry_drops_packet():
    devices, links = line_topology()
    pc1, _, pc2 = devices
    engine = make_engine(devices, links, FirstNeighbor(), ttl=2)

    # Reaching PC2 needs two transmits; TTL 2 hits zero on the second one.
    inject_ping(engine, pc1.id, pc2.id, at_time=0.0)
    events = drain(engine)

    assert not by_type(events, "packet_delivered")
    drops = by_type(events, "packet_dropped")
    assert len(drops) == 1 and drops[0].payload["reason"] == "ttl_expired"


def test_isolated_source_is_dead_end():
    lonely = Computer(id=1, name="Lonely")
    other = Computer(id=2, name="Other")
    engine = make_engine([lonely, other], [], FirstNeighbor())

    inject_ping(engine, lonely.id, other.id, at_time=0.0)
    events = drain(engine)

    drops = by_type(events, "packet_dropped")
    assert len(drops) == 1 and drops[0].payload["reason"] == "dead_end"


def test_max_events_limit_trips():
    # A packet addressed to a nonexistent node bounces between two routers
    # forever (the only move is backtracking) until the safety rail trips.
    r1, r2 = Router(id=1, name="RA"), Router(id=2, name="RB")
    links = [link(r1, r2, 1)]
    engine = make_engine([r1, r2], links, FirstNeighbor(), ttl=10_000, max_events=50)

    inject_ping(engine, r1.id, 99_999, at_time=0.0)
    drain(engine)

    assert engine.limit_hit == "max_events"


# --------------------------------------------------------------- random walk

def test_random_walk_completes_ping_on_diamond():
    devices, links = diamond_topology()
    pc1, pc2 = devices[0], devices[-1]
    engine = make_engine(devices, links, get_algorithm("random_walk"), seed=7)

    inject_ping(engine, pc1.id, pc2.id, at_time=0.0)
    events = drain(engine)

    delivered = by_type(events, "packet_delivered")
    assert [d.payload["icmp"] for d in delivered] == ["request", "reply"]
    assert delivered[1].node_id == pc1.id
    assert delivered[1].payload["rtt"] > 0


def test_random_walk_is_deterministic_per_seed():
    # One topology (stable device ids), two independent engines per call.
    devices, links = diamond_topology()

    def run(seed):
        engine = make_engine(devices, links, get_algorithm("random_walk"), seed=seed)
        inject_ping(engine, devices[0].id, devices[-1].id, at_time=0.0)
        return [(e.t, e.type, e.from_id, e.to_id, e.node_id) for e in drain(engine)]

    assert run(42) == run(42)


def test_random_walk_can_backtrack():
    # Uniform over every neighbor, including the one the packet came from —
    # over enough seeds a U-turn has to show up even where there's a choice.
    devices, links = diamond_topology()
    pc1, pc2 = devices[0], devices[-1]

    def has_backtrack(seed):
        engine = make_engine(devices, links, get_algorithm("random_walk"), seed=seed)
        inject_ping(engine, pc1.id, pc2.id, at_time=0.0)
        events = drain(engine)

        paths = {}
        for e in by_type(events, "packet_sent"):
            paths.setdefault(e.packet_id, [e.from_id]).append(e.to_id)
        return any(
            path[i] == path[i - 2]
            for path in paths.values()
            for i in range(2, len(path))
        )

    assert any(has_backtrack(seed) for seed in range(50))


def test_flooding_propagates_ping_id_across_all_copies():
    devices, links = diamond_topology()
    pc1, pc2 = devices[0], devices[-1]
    engine = make_engine(devices, links, get_algorithm("flooding"))
    ping_id = engine.inject_ping(pc1.id, pc2.id, at_time=0.0)
    events = drain(engine)

    delivered = by_type(events, "packet_delivered")
    assert len(delivered) > 0
    for d in delivered:
        assert d.payload.get("ping_id") == ping_id


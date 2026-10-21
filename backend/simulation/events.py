from dataclasses import dataclass, field

# Event types — the shared vocabulary of backend and frontend.
PACKET_SENT = "packet_sent"          # packet departs onto a link (t = departure)
PACKET_RECV = "packet_recv"          # packet arrives at a node (t = departure + link.delay)
PACKET_DELIVERED = "packet_delivered"  # data packet reached its destination
PACKET_DROPPED = "packet_dropped"    # TTL expired / algorithm gave up / dead end
TABLE_UPDATE = "table_update"        # a node's learned routing table changed
NODE_LOG = "node_log"                # free-text algorithm message for the UI log
TOPOLOGY_CHANGE = "topology_change"  # the user edited the network while it runs

KIND_DATA = "data"
KIND_CONTROL = "control"


@dataclass
class SimEvent:
    """One tick of the simulation timeline.

    The frontend animates packets by pairing PACKET_SENT with the matching
    PACKET_RECV (same packet_id/link_id): the dot travels between t_sent and
    t_recv. Every algorithm — trivial or convergent — speaks only this format.
    """

    seq: int                    # monotonic, unique within a run
    t: float                    # simulation time in ms
    type: str
    kind: str = KIND_DATA
    packet_id: str | None = None
    protocol: str | None = None  # "icmp", "hello", "lsa", ... (UI label)
    from_id: int | None = None   # sent/recv: link endpoints
    to_id: int | None = None
    link_id: int | None = None
    node_id: int | None = None   # node-scoped events (delivered/dropped/table/log)
    payload: dict = field(default_factory=dict)

    def to_dict(self):
        return {
            "seq": self.seq,
            "t": self.t,
            "type": self.type,
            "kind": self.kind,
            "packet_id": self.packet_id,
            "protocol": self.protocol,
            "from_id": self.from_id,
            "to_id": self.to_id,
            "link_id": self.link_id,
            "node_id": self.node_id,
            "payload": self.payload,
        }

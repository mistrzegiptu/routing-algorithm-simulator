from dataclasses import dataclass, field, replace


@dataclass
class Packet:
    """A packet travelling through the simulated network.

    ``meta`` is free scratch space for the algorithm (e.g. random walk stores
    ``prev_node`` there to avoid immediately bouncing back). The engine itself
    only touches ``ttl`` (data packets) and ``meta["payload"]`` set by
    ``ctx.send_control``.
    """

    id: str
    kind: str = "data"           # "data" | "control"
    protocol: str = "icmp"
    src_id: int | None = None
    dst_id: int | None = None    # data packets: target device id
    dst_ip: str | None = None    # informative; delivery also matches on port IPs
    ttl: int = 64
    meta: dict = field(default_factory=dict)

    def copy(self):
        """Independent copy (same id, own ttl/meta).

        Required when one packet fans out to several neighbors (flooding):
        forwarding the *same* object twice would share TTL and prev_node
        between the copies in flight.
        """
        return replace(self, meta=dict(self.meta))

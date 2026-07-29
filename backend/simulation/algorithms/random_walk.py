from ..algorithm import RoutingAlgorithm
from ..registry import register


@register
class RandomWalk(RoutingAlgorithm):
    """Trivial algorithm #1: forward to a random neighbor.

    No control plane, no routing tables — a pure per-hop coin flip over every
    neighbor, including the one the packet just arrived from. TTL bounds the
    worst case (e.g. bouncing back and forth on a dead-end branch).
    """

    name = "random_walk"
    display_name = "Random walk"
    description = "Router przekazuje pakiet losowemu sąsiadowi."

    def on_packet(self, ctx, node, packet):
        options = ctx.net.neighbors(node.id)
        if not options:
            ctx.drop(node, packet, "dead_end")
            return

        ctx.forward(node, packet, ctx.rng.choice(options))

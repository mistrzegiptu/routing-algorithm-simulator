from ..algorithm import RoutingAlgorithm
from ..registry import register


@register
class RandomWalk(RoutingAlgorithm):
    """Trivial algorithm #1: forward to a random neighbor.

    No control plane, no routing tables — a pure per-hop coin flip. The only
    refinement is avoiding an immediate U-turn (don't send the packet straight
    back where it came from) unless that is the only option, which keeps the
    walk from ping-ponging on dead-end branches forever. TTL still bounds the
    worst case.
    """

    name = "random_walk"
    display_name = "Random walk"
    description = "Router przekazuje pakiet losowemu sąsiadowi (unika zawracania)."

    def on_packet(self, ctx, node, packet):
        options = ctx.net.neighbors(node.id)
        if not options:
            ctx.drop(node, packet, "dead_end")
            return

        prev = packet.meta.get("prev_node")
        candidates = [adj for adj in options if adj.neighbor_id != prev] or options
        ctx.forward(node, packet, ctx.rng.choice(candidates))

from ..algorithm import RoutingAlgorithm
from ..registry import register


@register
class WeightedRandomWalk(RoutingAlgorithm):
    """Trivial algorithm #2: forward to a random neighbor, biased by link weight.

    Like RandomWalk, but instead of a uniform coin flip the next hop is drawn
    with probability proportional to each outgoing link's weight — a link with
    weight 3 is chosen three times as often as one with weight 1. Immediate
    U-turns are avoided unless there is no other option; TTL still bounds the
    worst case.
    """

    name = "weighted_random_walk"
    display_name = "Ważony random walk"
    description = "Router przekazuje pakiet losowemu sąsiadowi, faworyzując łącza o większej wadze."

    def on_packet(self, ctx, node, packet):
        options = ctx.net.neighbors(node.id)
        if not options:
            ctx.drop(node, packet, "dead_end")
            return

        prev = packet.meta.get("prev_node")
        candidates = [adj for adj in options if adj.neighbor_id != prev] or options

        weights = [adj.weight if adj.weight > 0 else 0 for adj in candidates]
        if sum(weights) > 0:
            chosen = ctx.rng.choices(candidates, weights=weights, k=1)[0]
        else:
            chosen = ctx.rng.choice(candidates)
        ctx.forward(node, packet, chosen)

from ..algorithm import RoutingAlgorithm
from ..registry import register

@register
class HotPotato(RoutingAlgorithm):
    name = "hot_potato"
    display_name = "Hot potato"
    description = "Router przekazuje pakiet sąsiadowi, który ma najmniejsze opóźnienie."

    def on_packet(self, ctx, node, packet):
        options = ctx.net.neighbors(node.id)
        if not options:
            ctx.drop(node, packet, "dead_end")
            return

        prev = packet.meta.get("prev_node")
        candidates = [adj for adj in options if adj.neighbor_id != prev] or options

        min_delay = min(adj.delay for adj in candidates)
        best_candidates = [adj for adj in candidates if adj.delay == min_delay]

        selected = ctx.rng.choice(best_candidates)
        ctx.forward(node, packet, selected)
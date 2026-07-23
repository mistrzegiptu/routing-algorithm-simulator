from ..algorithm import RoutingAlgorithm
from ..registry import register

@register
class Flooding(RoutingAlgorithm):
    name = "flooding"
    display_name = "Flooding"
    description = "Router przekazuje pakiet wszystkim sąsiadom (z wyjątkiem źródła)."

    def on_packet(self, ctx, node, packet):
        options = ctx.net.neighbors(node.id)

        if not options:
            ctx.drop(node, packet, "dead_end")
            return

        for neighbor in options:
            if neighbor.neighbor_id != packet.meta.get("prev_node"):
                ctx.forward(node, packet.copy(), neighbor)
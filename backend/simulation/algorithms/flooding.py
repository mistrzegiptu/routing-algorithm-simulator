from ..algorithm import RoutingAlgorithm
from ..registry import register

@register
class Flooding(RoutingAlgorithm):
    name = "flooding"
    display_name = "Flooding"
    description = "Router przekazuje pakiet wszystkim sąsiadom (z wyjątkiem źródła)."

    def on_packet(self, ctx, node, packet):
        seen_packages = ctx.state(node).setdefault("seen_packages", set())

        if packet.id in seen_packages:
            ctx.drop(node, packet, "duplicate")
            return

        seen_packages.add(packet.id)
        options = ctx.net.neighbors(node.id)

        if not options:
            ctx.drop(node, packet, "dead_end")
            return

        valid_neighbors = [n for n in options if n.neighbor_id != packet.meta.get("prev_node")]
        if len(valid_neighbors) == 0:
            ctx.drop(node, packet, "dead_end")
            return

        for neighbor in valid_neighbors:
            ctx.forward(node, packet.copy(), neighbor)
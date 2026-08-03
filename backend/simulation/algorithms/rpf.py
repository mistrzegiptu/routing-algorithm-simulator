from .flooding import Flooding
from ..registry import register

@register
class RPF(Flooding):
    name = "RPF"
    display_name = "RPF"
    description = "Router przekazuje pakiet wszystkim sąsiadom (z wyjątkiem źródła). Dodatkowo sprawdza, czy pakiet nie został już wcześniej odebrany"

    def on_packet(self, ctx, node, packet):
        routing_table = node.routing_table
        sender_id = packet.src_id
        prev_node = packet.meta.get("prev_node")

        if routing_table is None or sender_id is None:
            ctx.drop(node, packet, "no routing_table or sender_ip")
            return

        if prev_node is not None and prev_node != sender_id:
            sender_node = ctx.net.node(sender_id)

            if sender_node is None or not sender_node.ports:
                ctx.drop(node, packet, "cannot find sender IP")
                return

            sender_ip = sender_node.ports[0][0]
            expected_next_hop = node.find_next_hop(sender_ip)

            if not expected_next_hop:
                ctx.drop(node, packet, "no route to sender")
                return

            prev_node_device = ctx.net.node(prev_node)
            if not prev_node_device:
                ctx.drop(node, packet, "unknown prev_node")
                return

            prev_device_ips = [ip for ip, _ in prev_node_device.ports]
            if expected_next_hop not in prev_device_ips:
                ctx.drop(node, packet, "RPF check failed (wrong path)")
                return

        super().on_packet(ctx, node, packet)
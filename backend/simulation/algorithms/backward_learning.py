from ..algorithm import RoutingAlgorithm
from ..registry import register


@register
class BackwardLearning(RoutingAlgorithm):

    name = "backward_learning"
    display_name = "Backward learning"
    description = "Węzły uczą się tras z przychodzących pakietów danych, gdy router nie zna trasy flooduje, gdy zna - przekazuje bezpośrednio."

    @staticmethod
    def _ensure_state(ctx, node):
        st = ctx.state(node)
        if "table" not in st:
            st["table"] = {}
            st["seen"] = set()
        return st["table"], st["seen"]

    @staticmethod
    def _publish_table(ctx, node, table):
        rows = [
            {
                "dest_id": dest_id,
                "dest_name": (ctx.net.node(dest_id) or type("", (), {"name": f"?{dest_id}"})).name,
                "cost": cost,
                "next_hop_id": nh_id,
                "next_hop_name": (ctx.net.node(nh_id) or type("", (), {"name": f"?{nh_id}"})).name,
            }
            for dest_id, (cost, nh_id) in sorted(table.items())
        ]
        ctx.table_update(node, rows)

    @staticmethod
    def _find_adj_to(ctx, node_id, target_id):
        for adj in ctx.net.neighbors(node_id):
            if adj.neighbor_id == target_id:
                return adj
        return None

    def _learn(self, ctx, node, packet, table):
        prev_id = packet.meta.get("prev_node")
        hop_count = packet.meta.get("hop_count", 0)
        if prev_id is None or packet.src_id is None:
            return
        old = table.get(packet.src_id)
        if old is not None and hop_count >= old[0]:
            return
        table[packet.src_id] = (hop_count, prev_id)
        src_node = ctx.net.node(packet.src_id)
        src_name = src_node.name if src_node else f"?{packet.src_id}"
        prev_node = ctx.net.node(prev_id)
        prev_name = prev_node.name if prev_node else f"?{prev_id}"
        ctx.log(
            node,
            f"Nauczono trasę do {src_name} "
            f"przez {prev_name} (koszt {hop_count})",
        )
        self._publish_table(ctx, node, table)

    def on_deliver(self, ctx, node, packet):
        table, _ = self._ensure_state(ctx, node)
        self._learn(ctx, node, packet, table)

    def on_packet(self, ctx, node, packet):
        if packet.kind == "control":
            return

        table, seen = self._ensure_state(ctx, node)

        if packet.id in seen:
            ctx.drop(node, packet, "duplicate")
            return
        seen.add(packet.id)

        prev_id = packet.meta.get("prev_node")
        hop_count = packet.meta.get("hop_count", 0)

        self._learn(ctx, node, packet, table)

        packet.meta["hop_count"] = hop_count + 1

        neighbors = ctx.net.neighbors(node.id)
        if not neighbors:
            ctx.drop(node, packet, "dead_end")
            return

        route = table.get(packet.dst_id)
        if route is not None:
            adj = self._find_adj_to(ctx, node.id, route[1])
            if adj is not None:
                ctx.forward(node, packet, adj)
                return

        flooded = False
        for adj in neighbors:
            if adj.neighbor_id == prev_id:
                continue
            copy = packet.copy()
            ctx.forward(node, copy, adj)
            flooded = True

        if not flooded:
            ctx.drop(node, packet, "dead_end")
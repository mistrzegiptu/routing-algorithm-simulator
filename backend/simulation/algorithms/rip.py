import ipaddress
from dataclasses import dataclass
from functools import cache

from ..algorithm import RoutingAlgorithm
from ..registry import register

PROTOCOL = "rip"
INFINITY = 16
LINK_COST = 1

UPDATE_INTERVAL = 30_000
UPDATE_JITTER = 5_000
ROUTE_TIMEOUT = 180_000
GARBAGE_COLLECTION = 120_000
HOLD_DOWN = 180_000
TRIGGERED_MIN = 1_000
TRIGGERED_MAX = 5_000
BOOT_JITTER = 1_000

ADMIN_DISTANCE = {"connected": 0, "static": 1, "rip": 120}


def mask_bits(mask):
    return (0xFFFFFFFF << (32 - mask)) & 0xFFFFFFFF if mask > 0 else 0


@cache
def address(value):
    return str(ipaddress.IPv4Address(value))


@cache
def network_of(ip, mask):
    return int(ipaddress.IPv4Address(ip)) & mask_bits(mask)


def prefix(network, mask):
    return f"{address(network)}/{mask}"


def routes_word(count):
    if count == 1:
        return "trasa"
    if count % 10 in (2, 3, 4) and count % 100 not in (12, 13, 14):
        return "trasy"
    return "tras"


@dataclass
class Route:
    network: int
    mask: int
    metric: int
    source: str
    link_id: int | None
    interface_ip: str
    next_hop_ip: str | None = None
    next_hop_id: int | None = None
    refreshed_at: float = 0.0
    deletion_at: float | None = None
    hold_until: float | None = None
    changed: bool = False

    @property
    def key(self):
        return (self.network, self.mask)

    @property
    def reachable(self):
        return self.metric < INFINITY

    def delete_at(self):
        return max(self.deletion_at, self.hold_until or 0.0)

    def deadline(self):
        if self.source != PROTOCOL:
            return None
        if self.reachable:
            return self.refreshed_at + ROUTE_TIMEOUT
        return self.delete_at()


@register
class RIPv2(RoutingAlgorithm):
    name = "rip_v2"
    display_name = "RIPv2"
    description = (
        "Routery co 30 s wymieniają z sąsiadami tablice tras; metryka to liczba skoków, "
        "a 16 oznacza sieć nieosiągalną (RFC 2453)."
    )
    requires_convergence = True
    max_events = 1_000_000
    option_specs = [
        {
            "key": "split_horizon",
            "label": "Split horizon",
            "type": "choice",
            "default": "poisoned_reverse",
            "choices": [
                {"value": "off", "label": "Wyłączony"},
                {"value": "simple", "label": "Prosty"},
                {"value": "poisoned_reverse", "label": "Z poisoned reverse"},
            ],
            "description": (
                "Czy router ogłasza trasę sąsiadowi, od którego się jej nauczył: "
                "normalnie (wyłączony), wcale (prosty) albo z metryką 16 (poisoned reverse)."
            ),
        },
        {
            "key": "triggered_updates",
            "label": "Triggered updates",
            "type": "bool",
            "default": True,
            "description": (
                "Po zmianie trasy router od razu wysyła aktualizację (kolejne najwyżej co 1–5 s), "
                "zamiast czekać na aktualizację okresową."
            ),
        },
        {
            "key": "hold_down",
            "label": "Hold-down (Cisco)",
            "type": "bool",
            "default": False,
            "description": (
                "Przez 180 s po utracie trasy router ignoruje trasy do tej sieci od innych sąsiadów. "
                "Rozszerzenie Cisco, nie ma go w RFC."
            ),
        },
    ]

    def on_init(self, ctx):
        for node in ctx.net.nodes.values():
            if not node.is_router:
                continue
            st = ctx.state(node)
            st.update(
                routes={},
                next_update_at=None,
                triggered_hold_until=0.0,
                triggered_pending=False,
                maintenance_at=None,
                maintenance_gen=0,
                rejected_links=set(),
            )
            shared = set()
            for adj in ctx.net.neighbors(node.id):
                key = (network_of(adj.local_ip, adj.local_mask), adj.local_mask)
                if key in st["routes"]:
                    shared.add(key)
                    continue
                st["routes"][key] = Route(
                    network=key[0],
                    mask=key[1],
                    metric=LINK_COST,
                    source="connected",
                    link_id=adj.link_id,
                    interface_ip=adj.local_ip,
                )
            for key in sorted(shared):
                ctx.log(
                    node,
                    f"Kilka interfejsów w podsieci {prefix(*key)} — RIP nie rozróżni tych łączy, "
                    f"nadaj każdemu łączu osobną podsieć",
                )
            self._publish(ctx, node, st)
            ctx.schedule_timer(node, ctx.rng.uniform(0, BOOT_JITTER), "boot")

    def on_timer(self, ctx, node, timer):
        if not node.is_router:
            return
        st = ctx.state(node)
        if timer.name == "boot":
            for adj in self._rip_neighbors(ctx, node):
                ctx.send_control(
                    node, PROTOCOL, {"command": "request", "src_ip": adj.local_ip}, adj,
                    summary="Request",
                )
            self._schedule_update(ctx, node, st)
        elif timer.name == "update":
            self._send_update(ctx, node, st, only_changed=False, label="Response")
            self._schedule_update(ctx, node, st)
        elif timer.name == "triggered":
            st["triggered_pending"] = False
            if any(route.changed for route in st["routes"].values()):
                self._send_triggered(ctx, node, st)
        elif timer.name == "maintenance":
            if timer.payload.get("gen") != st["maintenance_gen"]:
                return
            st["maintenance_at"] = None
            self._maintain(ctx, node, st)
            self._schedule_maintenance(ctx, node, st)

    def on_packet(self, ctx, node, packet):
        if packet.kind == "control":
            if node.is_router and packet.protocol == PROTOCOL:
                self._on_rip_message(ctx, node, packet)
            return

        if not node.is_router:
            self._forward_from_host(ctx, node, packet)
            return

        adj, reason = self._next_adjacency(ctx, node, packet)
        if adj is None:
            ctx.drop(node, packet, reason)
        else:
            ctx.forward(node, packet, adj)

    def _rip_neighbors(self, ctx, node):
        result = []
        for adj in ctx.net.neighbors(node.id):
            neighbor = ctx.net.node(adj.neighbor_id)
            if neighbor is not None and neighbor.is_router:
                result.append(adj)
        return result

    def _schedule_update(self, ctx, node, st):
        delay = UPDATE_INTERVAL + ctx.rng.uniform(-UPDATE_JITTER, UPDATE_JITTER)
        st["next_update_at"] = ctx.now + delay
        ctx.schedule_timer(node, delay, "update")

    def _entries_for(self, st, adj, only_changed):
        mode = self.options["split_horizon"]
        entries = []
        for route in sorted(st["routes"].values(), key=lambda r: r.key):
            if only_changed and not route.changed:
                continue
            metric = route.metric
            if route.source == PROTOCOL and route.link_id == adj.link_id:
                if mode == "simple":
                    continue
                if mode == "poisoned_reverse":
                    metric = INFINITY
            entries.append({
                "network": address(route.network),
                "mask": route.mask,
                "metric": metric,
            })
        return entries

    def _send_response(self, ctx, node, st, adj, only_changed, label):
        entries = self._entries_for(st, adj, only_changed)
        if not entries:
            return
        unreachable = sum(1 for entry in entries if entry["metric"] >= INFINITY)
        summary = f"{label}: {len(entries)} {routes_word(len(entries))}"
        if unreachable:
            summary += f", {unreachable} z metryką 16"
        ctx.send_control(
            node, PROTOCOL,
            {"command": "response", "src_ip": adj.local_ip, "entries": entries},
            adj, summary=summary,
        )

    def _send_update(self, ctx, node, st, only_changed, label):
        for adj in self._rip_neighbors(ctx, node):
            self._send_response(ctx, node, st, adj, only_changed, label)
        for route in st["routes"].values():
            route.changed = False

    def _send_triggered(self, ctx, node, st):
        if st["next_update_at"] is not None and st["next_update_at"] <= ctx.now:
            return
        self._send_update(ctx, node, st, only_changed=True, label="Triggered update")
        st["triggered_hold_until"] = ctx.now + ctx.rng.uniform(TRIGGERED_MIN, TRIGGERED_MAX)

    def _signal_change(self, ctx, node, st):
        if not self.options["triggered_updates"] or st["triggered_pending"]:
            return
        if ctx.now >= st["triggered_hold_until"]:
            self._send_triggered(ctx, node, st)
            return
        if st["next_update_at"] is not None and st["next_update_at"] <= st["triggered_hold_until"]:
            return
        st["triggered_pending"] = True
        ctx.schedule_timer(node, st["triggered_hold_until"] - ctx.now, "triggered")

    def _find_adjacency(self, ctx, node, src_ip):
        for adj in ctx.net.neighbors(node.id):
            if adj.neighbor_ip == src_ip:
                return adj
        return None

    def _on_rip_message(self, ctx, node, packet):
        st = ctx.state(node)
        message = packet.meta.get("payload") or {}
        adj = self._find_adjacency(ctx, node, message.get("src_ip"))
        if adj is None:
            return
        if network_of(message["src_ip"], adj.local_mask) != network_of(adj.local_ip, adj.local_mask):
            if adj.link_id not in st["rejected_links"]:
                st["rejected_links"].add(adj.link_id)
                ctx.log(
                    node,
                    f"Odrzucam RIP od {self._name(ctx, adj.neighbor_id)}: "
                    f"{message['src_ip']} jest spoza podsieci {prefix(network_of(adj.local_ip, adj.local_mask), adj.local_mask)}",
                )
            return

        if message.get("command") == "request":
            self._send_response(ctx, node, st, adj, only_changed=False, label="Response")
        elif message.get("command") == "response":
            self._process_response(ctx, node, st, adj, message.get("entries") or [])

    def _process_response(self, ctx, node, st, adj, entries):
        now = ctx.now
        routes = st["routes"]
        counts = {"new": 0, "changed": 0, "unreachable": 0}

        for entry in entries:
            mask = entry.get("mask")
            metric = entry.get("metric")
            if not isinstance(mask, int) or not 0 <= mask <= 32:
                continue
            if not isinstance(metric, int) or not 1 <= metric <= INFINITY:
                continue
            network = network_of(entry["network"], mask)
            metric = min(metric + LINK_COST, INFINITY)
            route = routes.get((network, mask))

            if route is None:
                if metric < INFINITY:
                    route = Route(
                        network=network, mask=mask, metric=metric, source=PROTOCOL,
                        link_id=adj.link_id, interface_ip=adj.local_ip,
                        next_hop_ip=adj.neighbor_ip, next_hop_id=adj.neighbor_id,
                        refreshed_at=now, changed=True,
                    )
                    routes[route.key] = route
                    counts["new"] += 1
                continue

            if route.source != PROTOCOL:
                continue
            from_next_hop = route.link_id == adj.link_id
            if not from_next_hop and route.hold_until is not None and now < route.hold_until:
                continue
            if from_next_hop and metric < INFINITY:
                route.refreshed_at = now

            if (from_next_hop and metric != route.metric) or metric < route.metric:
                was_reachable = route.reachable
                route.metric = metric
                self._set_next_hop(route, adj)
                route.changed = True
                if metric >= INFINITY:
                    if was_reachable:
                        self._start_deletion(route, now)
                        counts["unreachable"] += 1
                else:
                    route.refreshed_at = now
                    route.deletion_at = None
                    route.hold_until = None
                    counts["changed"] += 1
            elif (
                metric == route.metric
                and not from_next_hop
                and route.reachable
                and now - route.refreshed_at >= ROUTE_TIMEOUT / 2
            ):
                self._set_next_hop(route, adj)
                route.refreshed_at = now
                route.changed = True
                counts["changed"] += 1

        if any(counts.values()):
            parts = []
            if counts["new"]:
                parts.append(f"nowe: {counts['new']}")
            if counts["changed"]:
                parts.append(f"zmienione: {counts['changed']}")
            if counts["unreachable"]:
                parts.append(f"nieosiągalne: {counts['unreachable']}")
            ctx.log(node, f"Aktualizacja od {self._name(ctx, adj.neighbor_id)} — {', '.join(parts)}")
            self._publish(ctx, node, st)
            self._signal_change(ctx, node, st)
        self._schedule_maintenance(ctx, node, st)

    def _set_next_hop(self, route, adj):
        route.link_id = adj.link_id
        route.interface_ip = adj.local_ip
        route.next_hop_ip = adj.neighbor_ip
        route.next_hop_id = adj.neighbor_id

    def _start_deletion(self, route, now):
        route.metric = INFINITY
        route.deletion_at = now + GARBAGE_COLLECTION
        route.hold_until = now + HOLD_DOWN if self.options["hold_down"] else None
        route.changed = True

    def _maintain(self, ctx, node, st):
        now = ctx.now
        expired, removed = [], []
        for key, route in list(st["routes"].items()):
            if route.source != PROTOCOL:
                continue
            if route.reachable:
                if now >= route.refreshed_at + ROUTE_TIMEOUT:
                    self._start_deletion(route, now)
                    expired.append(route)
            elif now >= route.delete_at():
                del st["routes"][key]
                removed.append(route)

        if expired:
            ctx.log(node, f"Timeout (180 s bez aktualizacji): {self._prefix_list(expired)} — metryka 16")
        if removed:
            ctx.log(node, f"Usunięto z tablicy: {self._prefix_list(removed)}")
        if expired or removed:
            self._publish(ctx, node, st)
        if expired:
            self._signal_change(ctx, node, st)

    def _schedule_maintenance(self, ctx, node, st):
        deadlines = [d for d in (route.deadline() for route in st["routes"].values()) if d is not None]
        if not deadlines:
            return
        due = min(deadlines)
        if st["maintenance_at"] is not None and st["maintenance_at"] <= due:
            return
        st["maintenance_gen"] += 1
        st["maintenance_at"] = due
        ctx.schedule_timer(node, max(0.0, due - ctx.now), "maintenance", {"gen": st["maintenance_gen"]})

    def _forward_from_host(self, ctx, node, packet):
        neighbors = ctx.net.neighbors(node.id)
        if packet.meta.get("prev_node") is not None:
            ctx.drop(node, packet, "not_a_router")
        elif not neighbors:
            ctx.drop(node, packet, "dead_end")
        else:
            ctx.forward(node, packet, neighbors[0])

    def _next_adjacency(self, ctx, node, packet):
        if not packet.dst_ip:
            return None, "no_destination_ip"
        destination = network_of(packet.dst_ip, 32)
        neighbors = ctx.net.neighbors(node.id)

        for adj in neighbors:
            if adj.neighbor_ip == packet.dst_ip and network_of(adj.local_ip, adj.local_mask) == destination & mask_bits(adj.local_mask):
                return adj, None

        best = None
        for route in ctx.state(node)["routes"].values():
            if route.reachable and destination & mask_bits(route.mask) == route.network:
                candidate = (route.mask, -ADMIN_DISTANCE[route.source], route)
                if best is None or candidate[:2] > best[:2]:
                    best = candidate
        for static in node.routing_table:
            if static.entry_type != "static":
                continue
            if destination & mask_bits(static.mask) == network_of(static.dest, static.mask):
                candidate = (static.mask, -ADMIN_DISTANCE["static"], static)
                if best is None or candidate[:2] > best[:2]:
                    best = candidate

        if best is None:
            return None, "no_route"
        chosen = best[2]
        if isinstance(chosen, Route):
            if chosen.source == "connected":
                return None, "host_unreachable"
            adj = next((a for a in neighbors if a.link_id == chosen.link_id), None)
        else:
            adj = next((a for a in neighbors if a.neighbor_ip == chosen.next_hop), None)
        if adj is None:
            return None, "no_route"
        return adj, None

    def _publish(self, ctx, node, st):
        rows = []
        for route in sorted(st["routes"].values(), key=lambda r: r.key):
            if route.source == "connected":
                state = "connected"
            elif route.reachable:
                state = "valid"
            elif route.hold_until is not None and ctx.now < route.hold_until:
                state = "hold_down"
            else:
                state = "garbage_collection"
            rows.append({
                "dest": prefix(route.network, route.mask),
                "metric": route.metric,
                "next_hop": route.next_hop_ip,
                "next_hop_name": self._name(ctx, route.next_hop_id) if route.next_hop_id is not None else None,
                "interface": route.interface_ip,
                "type": route.source,
                "state": state,
            })
        ctx.table_update(node, rows)

    def _name(self, ctx, node_id):
        node = ctx.net.node(node_id)
        return node.name if node is not None else f"#{node_id}"

    def _prefix_list(self, routes):
        names = [prefix(route.network, route.mask) for route in routes[:3]]
        if len(routes) > 3:
            names.append(f"… (+{len(routes) - 3})")
        return ", ".join(names)

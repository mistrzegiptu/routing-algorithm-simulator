from dataclasses import dataclass, field

from objects.device import Device
from objects.route_entry import RouteEntry


@dataclass(frozen=True)
class Adjacency:
    """One usable direction of a link, seen from a specific node."""

    link_id: int
    neighbor_id: int
    local_port: int
    local_ip: str
    local_mask: int
    neighbor_ip: str
    delay: int
    bandwidth: int | None
    weight: int = 1


@dataclass
class SimNode:
    id: int
    name: str
    is_router: bool
    ports: list[tuple[str, int]]                 # (ip, mask)
    routing_table: list[RouteEntry] = field(default_factory=list)

    def find_next_hop(self, dest_ip):
        """Longest-prefix match + administrative distance, mirroring
        Device.find_next_hop — but over the snapshot's own table copy."""
        ad_map = {"connected": 0, "static": 1}
        routes = []
        for r in self.routing_table:
            match_bits = Device.count_beginning(dest_ip, r.dest)
            if match_bits >= r.mask:
                routes.append(r)
        if not routes:
            return None
        routes.sort(key=lambda r: (-r.mask, ad_map.get(r.entry_type.lower(), 255)))
        return routes[0].next_hop

    def has_ip(self, ip):
        return any(p_ip == ip for p_ip, _ in self.ports)


@dataclass(frozen=True)
class SimLink:
    id: int
    a: int
    b: int
    port_a: int
    port_b: int
    ip_a: str
    mask_a: int
    ip_b: str
    mask_b: int
    delay: int
    bandwidth: int | None
    unit: str
    weight: int = 1

    def other(self, node_id):
        return self.b if node_id == self.a else self.a

    def adjacency(self, node_id):
        """The link seen from ``node_id`` — the same Adjacency neighbors() lists."""
        if node_id == self.a:
            local_port, local_ip, local_mask, neighbor_ip = self.port_a, self.ip_a, self.mask_a, self.ip_b
        else:
            local_port, local_ip, local_mask, neighbor_ip = self.port_b, self.ip_b, self.mask_b, self.ip_a
        return Adjacency(
            link_id=self.id, neighbor_id=self.other(node_id),
            local_port=local_port, local_ip=local_ip, local_mask=local_mask,
            neighbor_ip=neighbor_ip, delay=self.delay, bandwidth=self.bandwidth, weight=self.weight,
        )

    def wiring(self):
        return (self.a, self.b, self.ip_a, self.mask_a, self.ip_b, self.mask_b)

    def params(self):
        return {"delay": self.delay, "bandwidth": self.bandwidth, "unit": self.unit, "weight": self.weight}


class NetworkSnapshot:
    """Copy of the topology the simulation runs on.

    Built from the live devices_db/links_db when a run starts and rebuilt after
    every edit made while it runs (SimulationEngine.apply_topology diffs the
    two). The simulation never writes back to the real model, so
    user-configured devices and static routes stay untouched (design decision #3).
    """

    def __init__(self, nodes, links, adjacency):
        self.nodes = nodes            # dict[int, SimNode]
        self.links = links            # dict[int, SimLink]
        self._adjacency = adjacency   # dict[int, list[Adjacency]]

    @classmethod
    def from_db(cls, devices_db, links_db):
        nodes = {}
        for d in devices_db:
            nodes[d.id] = SimNode(
                id=d.id,
                name=d.name,
                is_router=bool(getattr(d, "dynamic_ports", False)),
                ports=[(p.ip, p.mask) for p in d.ports],
                routing_table=[
                    RouteEntry(r.dest, r.mask, r.next_hop, r.entry_type)
                    for r in d.routing_table
                ],
            )

        links = {}
        adjacency = {node_id: [] for node_id in nodes}
        for l in links_db:
            node_a = nodes.get(l.device_a)
            node_b = nodes.get(l.device_b)
            if not node_a or not node_b:
                continue
            if l.port_a_num >= len(node_a.ports) or l.port_b_num >= len(node_b.ports):
                continue

            ip_a, mask_a = node_a.ports[l.port_a_num]
            ip_b, mask_b = node_b.ports[l.port_b_num]
            link = SimLink(
                id=l.id, a=l.device_a, b=l.device_b,
                port_a=l.port_a_num, port_b=l.port_b_num,
                ip_a=ip_a, mask_a=mask_a, ip_b=ip_b, mask_b=mask_b,
                delay=l.delay, bandwidth=l.bandwidth, unit=l.unit, weight=l.weight,
            )
            links[l.id] = link
            adjacency[l.device_a].append(link.adjacency(l.device_a))
            adjacency[l.device_b].append(link.adjacency(l.device_b))

        return cls(nodes, links, adjacency)

    def node(self, node_id):
        return self.nodes.get(node_id)

    def neighbors(self, node_id):
        """All adjacencies of a node (one entry per connected link)."""
        return self._adjacency.get(node_id, [])

    def find_by_ip(self, ip):
        for node in self.nodes.values():
            if node.has_ip(ip):
                return node
        return None

    def first_ip(self, node_id):
        node = self.nodes.get(node_id)
        if not node:
            return None
        for ip, _ in node.ports:
            if ip:
                return ip
        return None

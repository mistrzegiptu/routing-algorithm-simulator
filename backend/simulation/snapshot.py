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
    delay: int
    bandwidth: int | None
    unit: str
    weight: int = 1


class NetworkSnapshot:
    """Immutable copy of the topology the simulation runs on.

    Built once per run from the live devices_db/links_db; the simulation never
    reads or writes the real model afterwards, so user-configured devices and
    static routes stay untouched (design decision #3).
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
                # NOTE: topologies rebuilt by import_topology come back as base
                # Device instances, so is_router degrades to False there
                # (known serialize.py limitation, see design doc §4).
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

            weight = getattr(l, "weight", 1)
            links[l.id] = SimLink(
                id=l.id, a=l.device_a, b=l.device_b,
                port_a=l.port_a_num, port_b=l.port_b_num,
                delay=l.delay, bandwidth=l.bandwidth, unit=l.unit, weight=weight,
            )

            ip_a, mask_a = node_a.ports[l.port_a_num]
            ip_b, mask_b = node_b.ports[l.port_b_num]
            adjacency[l.device_a].append(Adjacency(
                link_id=l.id, neighbor_id=l.device_b,
                local_port=l.port_a_num, local_ip=ip_a, local_mask=mask_a,
                neighbor_ip=ip_b, delay=l.delay, bandwidth=l.bandwidth, weight=weight,
            ))
            adjacency[l.device_b].append(Adjacency(
                link_id=l.id, neighbor_id=l.device_a,
                local_port=l.port_b_num, local_ip=ip_b, local_mask=mask_b,
                neighbor_ip=ip_a, delay=l.delay, bandwidth=l.bandwidth, weight=weight,
            ))

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

    def disconnect_link(self, link_id):
        link = self.links.pop(link_id, None)
        if not link:
            return False

        for node_id in (link.a, link.b):
            self._adjacency[node_id] = [
                adjacency for adjacency in self._adjacency[node_id]
                if adjacency.link_id != link_id
            ]
        return True

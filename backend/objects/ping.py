import ipaddress as addr


def _device_map(devices_db):
    return {d.id: d for d in devices_db}


def _build_link_topology(links_db, devices_db):
    device_map = _device_map(devices_db)
    topology = {d.id: [] for d in devices_db}

    for link in links_db:
        dev_a = device_map.get(link.device_a)
        dev_b = device_map.get(link.device_b)
        if not dev_a or not dev_b:
            continue

        port_a = dev_a.ports[link.port_a_num] if link.port_a_num < len(dev_a.ports) else None
        port_b = dev_b.ports[link.port_b_num] if link.port_b_num < len(dev_b.ports) else None

        if port_a and port_b:
            topology[link.device_a].append((port_b.ip, link.device_b, link, link.port_a_num))
            topology[link.device_b].append((port_a.ip, link.device_a, link, link.port_b_num))

    return topology

def _find_neighbor_by_next_hop(device, next_hop_ip, topology):
    for neighbor_ip, neighbor_id, link, local_port in topology.get(device.id, []):
        if neighbor_ip == next_hop_ip:
            return neighbor_id, link
    return None


def _get_device_target_ip(target_device):
    for port in target_device.ports:
        if port.ip:
            return port.ip
    return None


def _same_subnet(ip_a, ip_b, mask):
    net_a = int(addr.IPv4Address(ip_a)) >> (32 - mask) if mask > 0 else 0
    net_b = int(addr.IPv4Address(ip_b)) >> (32 - mask) if mask > 0 else 0
    return net_a == net_b


def _get_default_gateway(device, topology):
    neighbors = topology.get(device.id, [])
    if len(neighbors) == 1:
        _, neighbor_id, link, _ = neighbors[0]
        return neighbor_id, link
    return None


def trace_route(devices_db, links_db, source_id, target_id):
    device_map = _device_map(devices_db)
    source = device_map.get(source_id)
    target = device_map.get(target_id)

    if not source or not target:
        return []

    if source_id == target_id:
        return [(source_id, None)]

    dest_ip = _get_device_target_ip(target)
    if not dest_ip:
        return []

    topology = _build_link_topology(links_db, devices_db)
    path = [(source_id, None)]
    visited = {source_id}
    current = source

    max_hops = len(devices_db) + 1

    for _ in range(max_hops):
        direct = _is_dest_directly_connected(current, dest_ip, topology, device_map)
        if direct:
            neighbor_id, link = direct
            path.append((neighbor_id, link))
            return path

        next_hop_ip = current.find_next_hop(dest_ip)

        if next_hop_ip:
            neighbor = _find_neighbor_by_next_hop(current, next_hop_ip, topology)
            if not neighbor:
                return []
        else:
            neighbor = _get_default_gateway(current, topology)
            if not neighbor:
                return []

        neighbor_id, link = neighbor

        if neighbor_id in visited:
            return []

        visited.add(neighbor_id)
        path.append((neighbor_id, link))

        if neighbor_id == target_id:
            return path

        current = device_map.get(neighbor_id)
        if not current:
            return []

    return []


def _is_dest_directly_connected(device, dest_ip, topology, device_map):
    for neighbor_ip, neighbor_id, link, local_port_num in topology.get(device.id, []):
        if neighbor_ip == dest_ip:
            return neighbor_id, link

        if local_port_num < len(device.ports):
            local_port = device.ports[local_port_num]
            if local_port.mask and _same_subnet(local_port.ip, dest_ip, local_port.mask):
                neighbor_dev = device_map.get(neighbor_id)
                if neighbor_dev and any(p.ip == dest_ip for p in neighbor_dev.ports):
                    return neighbor_id, link

    return None


def build_ping_result(devices_db, links_db, source_id, target_id):
    device_map = _device_map(devices_db)
    source = device_map.get(source_id)
    target = device_map.get(target_id)

    if not source or not target:
        return _fail("Device not found")

    if source_id == target_id:
        return {
            "success": True,
            "path": [source_id],
            "hops": [],
            "total_delay": 0,
            "hop_count": 0,
            "message": f"Ping to self ({source.name}) — 0ms",
        }

    dest_ip = _get_device_target_ip(target)
    if not dest_ip:
        return _fail(f"Destination {target.name} has no IP address configured")

    forward_path = trace_route(devices_db, links_db, source_id, target_id)

    if not forward_path or forward_path[-1][0] != target_id:
        source_has_route = source.find_next_hop(dest_ip) is not None
        if not source_has_route:
            topology = _build_link_topology(links_db, devices_db)
            has_link = any(
                neighbor_id == target_id
                for _, neighbor_id, _, _ in topology.get(source_id, [])
            )
            if has_link:
                return _fail(
                    f"Destination unreachable — {source.name} has no route to "
                    f"{dest_ip} ({target.name}). Devices are connected but "
                    f"routing is not configured."
                )
            else:
                return _fail(
                    f"Destination unreachable — no route from {source.name} "
                    f"to {dest_ip} ({target.name})"
                )
        else:
            return _fail(
                f"Destination unreachable — routing failed at an intermediate hop"
            )

    return_path = trace_route(devices_db, links_db, target_id, source_id)

    if not return_path or return_path[-1][0] != source_id:
        source_ip = _get_device_target_ip(source)
        return _fail(
            f"Request timed out — {target.name} reached but reply "
            f"cannot route back to {source.name} "
            f"({source_ip or '?'}). "
            f"Check return routing."
        )

    hops = []
    total_delay = 0

    for i in range(1, len(forward_path)):
        device_id, link = forward_path[i]
        prev_device_id = forward_path[i - 1][0]
        delay = link.delay if link else 0
        total_delay += delay

        prev_dev = device_map.get(prev_device_id)
        cur_dev = device_map.get(device_id)

        hops.append({
            "from_id": prev_device_id,
            "from_name": prev_dev.name if prev_dev else f"Device {prev_device_id}",
            "to_id": device_id,
            "to_name": cur_dev.name if cur_dev else f"Device {device_id}",
            "link_id": link.id if link else None,
            "delay": delay,
        })

    return_delay = 0
    for i in range(1, len(return_path)):
        _, link = return_path[i]
        if link:
            return_delay += link.delay

    round_trip_delay = total_delay + return_delay
    hop_count = len(hops)

    return {
        "success": True,
        "path": [p[0] for p in forward_path],
        "hops": hops,
        "total_delay": round_trip_delay,
        "hop_count": hop_count,
        "message": (
            f"Ping {source.name} → {target.name} ({dest_ip}): "
            f"{hop_count} hop(s), RTT {round_trip_delay}ms"
        ),
    }


def _fail(message):
    return {
        "success": False,
        "path": [],
        "hops": [],
        "total_delay": 0,
        "hop_count": 0,
        "message": message,
    }


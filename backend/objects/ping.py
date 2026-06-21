from collections import deque


def find_path(devices_db, links_db, source_id, target_id):
    """
    BFS over physical links to find shortest path between two devices.
    Returns list of (device_id, link_id) tuples representing the path.
    The first tuple has link_id=None (source device).
    """
    if source_id == target_id:
        return [(source_id, None)]

    device_ids = {d.id for d in devices_db}
    if source_id not in device_ids or target_id not in device_ids:
        return []

    # Build adjacency list from links: device_id -> [(neighbor_id, link)]
    adjacency = {}
    for device in devices_db:
        adjacency[device.id] = []

    for link in links_db:
        adjacency[link.device_a].append((link.device_b, link))
        adjacency[link.device_b].append((link.device_a, link))

    # BFS
    visited = {source_id}
    queue = deque()
    queue.append((source_id, [(source_id, None)]))

    while queue:
        current_id, path = queue.popleft()

        for neighbor_id, link in adjacency.get(current_id, []):
            if neighbor_id in visited:
                continue

            new_path = path + [(neighbor_id, link)]

            if neighbor_id == target_id:
                return new_path

            visited.add(neighbor_id)
            queue.append((neighbor_id, new_path))

    return []


def build_ping_result(devices_db, links_db, source_id, target_id):
    """
    Execute a ping from source to target device.
    Returns a dict with success status, path, hops, delays, and message.
    """
    path = find_path(devices_db, links_db, source_id, target_id)

    if not path:
        return {
            "success": False,
            "path": [],
            "hops": [],
            "total_delay": 0,
            "hop_count": 0,
            "message": "Destination unreachable — no path exists between these devices",
        }

    if len(path) == 1:
        device = next((d for d in devices_db if d.id == source_id), None)
        device_name = device.name if device else f"Device {source_id}"
        return {
            "success": True,
            "path": [source_id],
            "hops": [],
            "total_delay": 0,
            "hop_count": 0,
            "message": f"Ping to self ({device_name}) — 0ms",
        }

    device_name_map = {d.id: d.name for d in devices_db}

    hops = []
    total_delay = 0

    for i in range(1, len(path)):
        device_id, link = path[i]
        prev_device_id = path[i - 1][0]
        delay = link.delay if link else 0
        total_delay += delay

        hops.append({
            "from_id": prev_device_id,
            "from_name": device_name_map.get(prev_device_id, f"Device {prev_device_id}"),
            "to_id": device_id,
            "to_name": device_name_map.get(device_id, f"Device {device_id}"),
            "link_id": link.id if link else None,
            "delay": delay,
        })

    hop_count = len(hops)
    path_ids = [p[0] for p in path]
    source_name = device_name_map.get(source_id, f"Device {source_id}")
    target_name = device_name_map.get(target_id, f"Device {target_id}")

    return {
        "success": True,
        "path": path_ids,
        "hops": hops,
        "total_delay": total_delay,
        "hop_count": hop_count,
        "message": f"Ping {source_name} → {target_name}: {hop_count} hop(s), {total_delay}ms total",
    }

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from modules.serialize import export_topology, import_topology

from objects.api_objects import DeviceCreateRequest, DeviceUpdateRequest, CreateLinkRequest, RouteCreateRequest, RouteDeleteRequest, PingRequest
from objects.device import Device
from objects.computer import Computer
from objects.router import Router
from objects.ping import build_ping_result

app = FastAPI(title="Hello World")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

devices_db = []
links_db = []

DEVICE_CLASSES = {
    "router": Router,
    "computer": Computer,
}


def serialize_device(device):
    return {
        "id": device.id,
        "name": device.name,
        "port_number": device.port_number,
        "type": device.__class__.__name__.lower(),
        "ports": [{"ip": p.ip, "mask": p.mask} for p in device.ports],
    }


def serialize_link(link):
    return {
        "id": link.id,
        "device_a_id": link.device_a,
        "device_b_id": link.device_b,
        "port_a_num": link.port_a_num,
        "port_b_num": link.port_b_num,
        "bandwidth": link.bandwidth,
        "delay": link.delay,
        "unit": link.unit,
    }


def find_device(device_id):
    return next((d for d in devices_db if d.id == device_id), None)


@app.get("/api/check")
def healthcheck():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "backend-api"
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Message received: {data}")

    except WebSocketDisconnect:
        print("Client disconnected")


@app.post("/api/devices")
def create_device(device_data: DeviceCreateRequest):
    kwargs = {}
    if device_data.name is not None:
        kwargs['name'] = device_data.name

    if device_data.port_number is not None:
        kwargs['port_number'] = device_data.port_number
    else:
        # Option A: routers start empty and grow on connect; computers get one NIC.
        kwargs['port_number'] = 0 if device_data.type == "router" else 1

    device_cls = DEVICE_CLASSES[device_data.type]
    new_device = device_cls(**kwargs)
    devices_db.append(new_device)

    return serialize_device(new_device)


@app.put("/api/devices/{device_id}")
def update_device(
    device_id: int,
    device_data: DeviceUpdateRequest = Body(...)
):
    device = find_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if device_data.name is not None:
        device.name = device_data.name

    if device_data.ports is not None:
        for i, port_data in enumerate(device_data.ports):
            if i < len(device.ports):
                try:
                    current_port = device.ports[i]
                    new_ip = port_data.ip if port_data.ip != current_port.ip else None
                    new_mask = port_data.mask if port_data.mask != current_port.mask else None

                    if new_ip or new_mask:
                        device.edit_port(current_port, new_ip=new_ip, new_mask=new_mask)
                except ValueError as e:
                    raise HTTPException(status_code=400, detail=str(e))

    return serialize_device(device)


@app.delete("/api/devices/{device_id}")
def delete_device(device_id: int):
    device = find_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Tear down every link touching this device, keeping the peer device in sync.
    removed_link_ids = []
    # peer_id -> (peer_device, [interface indices freed by the removed links])
    freed_peer_ports = {}
    affected_links = [
        l for l in links_db if l.device_a == device_id or l.device_b == device_id
    ]
    for link in affected_links:
        if link.device_a == device_id:
            peer_id, peer_port = link.device_b, link.port_b_num
        else:
            peer_id, peer_port = link.device_a, link.port_a_num

        peer = find_device(peer_id)
        links_db.remove(link)
        removed_link_ids.append(link.id)
        if peer:
            peer.links = [l for l in peer.links if l.id != link.id]
            freed_peer_ports.setdefault(peer_id, (peer, []))[1].append(peer_port)

    # Free each peer's now-orphaned interface. Remove higher indices first so the
    # index shifts don't invalidate the lower ones still queued for removal.
    for peer, port_nums in freed_peer_ports.values():
        for port_num in sorted(port_nums, reverse=True):
            peer.remove_link_port(port_num)

    # Return this device's IP addresses to the shared pool so they can be reused.
    for port in device.ports:
        Device.ip_address_pool.discard(port.ip)

    devices_db.remove(device)

    # The client needs the peers' new interface lists and any links whose
    # interface indices shifted during the removal above.
    updated_devices = [serialize_device(peer) for peer, _ in freed_peer_ports.values()]
    updated_links = [
        serialize_link(l)
        for l in links_db
        if l.device_a in freed_peer_ports or l.device_b in freed_peer_ports
    ]

    return {
        "message": "Device deleted successfully",
        "removed_link_ids": removed_link_ids,
        "updated_devices": updated_devices,
        "updated_links": updated_links,
    }


@app.get("/api/devices/{device_id}/available-ports")
def get_available_ports(device_id: int):
    device = find_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    available_ports = [
        port_num
        for port_num in range(device.port_number)
        if device.check_port_availability(port_num)
    ]

    return {"available_ports": available_ports}


@app.post("/api/links")
def create_link(link_data: CreateLinkRequest):
    device_a = find_device(link_data.device_a_id)
    device_b = find_device(link_data.device_b_id)

    if not device_a or not device_b:
        raise HTTPException(status_code=404, detail="At least one of the devices not found")
    if isinstance(device_a, Computer) and isinstance(device_b, Computer):
        raise HTTPException(status_code=400, detail="Two computers cannot be connected directly")

    try:
        port_a_num = link_data.port_a_num
        port_b_num = link_data.port_b_num
        if port_a_num is None:
            port_a_num = device_a.allocate_link_port()
        if port_b_num is None:
            port_b_num = device_b.allocate_link_port()

        link = device_a.add_link(device_b, port_a_num, port_b_num, link_data.bandwidth, link_data.delay, link_data.unit)
        links_db.append(link)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        **serialize_link(link),
        # Fresh device state so the client can render newly allocated interfaces.
        "device_a": serialize_device(device_a),
        "device_b": serialize_device(device_b),
    }


@app.delete("/api/links/{link_id}")
def delete_link(link_id: int):
    link = next((l for l in links_db if l.id == link_id), None)
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    links_db.remove(link)
    device_a = find_device(link.device_a)
    device_b = find_device(link.device_b)

    if not device_a or not device_b:
        raise HTTPException(status_code=404, detail="At least one of the devices not found")

    try:
        device_a.del_link(link_id, device_b)
        return {"message": "Link deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/api/links/{link_id}")
def update_link(link_id: int, link_data: CreateLinkRequest):
    delete_link(link_id)
    return create_link(link_data)

@app.post("/api/route/{device_id}")
def add_route(route: RouteCreateRequest, device_id: int):
    device = find_device(device_id)
    if not device: raise HTTPException(status_code=404, detail="Device has been not found")

    try:
        device.add_route(route.dest, route.mask, route.next_hop, route.entry_type)
        return {"message":"Route added"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@app.get("/api/route/{device_id}")
def get_routes(device_id: int):
    device = find_device(device_id)
    if not device: raise HTTPException(status_code=404, detail="Device has been not found")
    return {"routes": device.routing_table}

@app.delete("/api/route/{device_id}")
def delete_route(device_id: int, route_data: RouteDeleteRequest):
    device = find_device(device_id)
    if not device: raise HTTPException(status_code=404, detail="Device has been not found")

    try:
        device.delete_route(route_data.dest, route_data.mask)
        return {"message": "Route deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/ping")
def ping(ping_data: PingRequest):
    source = find_device(ping_data.source_id)
    target = find_device(ping_data.target_id)

    if not source:
        raise HTTPException(status_code=404, detail=f"Source device {ping_data.source_id} not found")
    if not target:
        raise HTTPException(status_code=404, detail=f"Target device {ping_data.target_id} not found")

    result = build_ping_result(devices_db, links_db, ping_data.source_id, ping_data.target_id)
    return result

@app.get("/api/export")
def export_topology_endpoint():
    exported_data = export_topology(devices_db, links_db)
    return exported_data

@app.post("/api/import")
def import_topology_endpoint(json_content: dict = Body(...)):
    import_topology(json_content, devices_db, links_db)
    return {"message": "Topology imported successfully"}
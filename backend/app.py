from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

from objects.api_objects import RouterCreateRequest, RouterUpdateRequest, CreateLinkRequest
from objects.router import Router

app = FastAPI(title="Hello World")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

routers_db = []
links_db = []

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

@app.post("/api/routers")
def create_router(router_data: RouterCreateRequest):
    kwargs = {}
    if router_data.name is not None:
        kwargs['name'] = router_data.name
    if router_data.port_number is not None:
        kwargs['port_number'] = router_data.port_number

    new_router = Router(**kwargs)
    routers_db.append(new_router)

    return {
        "id": new_router.id,
        "name": new_router.name,
        "port_number": new_router.port_number,
        "ports": [{"ip": p.ip, "mask": p.mask} for p in new_router.ports]
    }

@app.put("/api/routers/{router_id}")
def update_router(
    router_id: int, 
    router_data: RouterUpdateRequest = Body(...)
):
    router = next((r for r in routers_db if r.id == router_id), None)
    if not router:
        raise HTTPException(status_code=404, detail="Router not found")

    if router_data.name is not None:
        router.name = router_data.name

    if router_data.ports is not None:
        for i, port_data in enumerate(router_data.ports):
            if i < len(router.ports):
                try:
                    current_port = router.ports[i]
                    new_ip = port_data.ip if port_data.ip != current_port.ip else None
                    new_mask = port_data.mask if port_data.mask != current_port.mask else None
                    
                    if new_ip or new_mask:
                        router.edit_port(current_port, new_ip=new_ip, new_mask=new_mask)
                except ValueError as e:
                    raise HTTPException(status_code=400, detail=str(e))

    return {
        "id": router.id,
        "name": router.name,
        "port_number": router.port_number,
        "ports": [{"ip": p.ip, "mask": p.mask} for p in router.ports]
    }

@app.get("/api/{router_id}/available-ports")
def get_available_ports(router_id: int):
    router = next((r for r in routers_db if r.id == router_id), None)

    if not router:
        raise HTTPException(status_code=404, detail="Router not found")

    available_ports = []
    for port_num in range(router.port_number):
        if router.check_port_availability(port_num):
            available_ports.append(port_num)
    
    return {"available_ports": available_ports}

@app.post("/api/links")
def create_link(link_data: CreateLinkRequest):
    device_a = next((r for r in routers_db if r.id == link_data.device_a_id), None)
    device_b = next((r for r in routers_db if r.id == link_data.device_b_id), None)

    if not device_a or not device_b:
        raise HTTPException(status_code=404, detail="At least one of the devices not found")
    try:
        link = device_a.add_link(device_b, link_data.port_a_num, link_data.port_b_num, link_data.bandwidth, link_data.delay, link_data.unit)
        links_db.append(link)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    return {
        "id": link.id,
        "device_a_id": link.device_a,
        "device_b_id": link.device_b,
        "port_a_num": link.port_a_num,
        "port_b_num": link.port_b_num,
        "bandwidth": link.bandwidth,
        "delay": link.delay,
        "unit": link.unit
    }

@app.delete("/api/links/{link_id}")
def delete_link(link_id: int):
    link = next((l for l in links_db if l.id == link_id), None)
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    
    links_db.remove(link)
    device_a = next((r for r in routers_db if r.id == link.device_a), None)
    device_b = next((r for r in routers_db if r.id == link.device_b), None)

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
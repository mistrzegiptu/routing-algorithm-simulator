from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body
from datetime import datetime

from objects.api_objects import RouterCreateRequest, RouterUpdateRequest
from objects.router import Router

app = FastAPI(title="Hello World")

routers_db = []

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

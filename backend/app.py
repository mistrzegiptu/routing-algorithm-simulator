from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from datetime import datetime

from objects.api_objects import RouterCreateRequest
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
    }

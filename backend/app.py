from fastapi import FastAPI, WebSocket

app = FastAPI(title="Hello World")

@app.get("/")
def say_hello():
    return {"message": "Hello World"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    while True:
        data = await websocket.receive_text()
        await websocket.send_text(f"Message received: {data}")
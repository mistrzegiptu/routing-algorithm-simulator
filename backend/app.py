from fastapi import FastAPI

app = FastAPI(title="Hello World")

@app.get("/")
def say_hello():
    return {"message": "Hello World"}
import { useState, useEffect } from 'react';

function App() {
  const [message, setMessage] = useState("Loading backend data...");
  const [wsMessage, setWsMessage] = useState("Waiting for websocket...");

  useEffect(() => {
    fetch("/api/")
      .then((response) => {
        if (!response.ok) throw new Error("Network response was not ok");
        return response.json();
      })
      .then((data) => {
        setMessage(data.message);
      })
      .catch((error) => {
        console.error("Fetch error:", error);
        setMessage("Failed to connect to backend. Is Uvicorn running?");
      });

    const ws = new WebSocket("ws://localhost:5000/ws");

    ws.onopen = () => {
      console.log("WebSocket connected");
      ws.send("Hello from React");
    };

    ws.onmessage = (event) => {
      console.log("WS message:", event.data);
      setWsMessage(event.data);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
    };

    return () => ws.close();

  }, []);

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif", textAlign: "center" }}>
      <h1>React + FastAPI</h1>

      <div style={{ padding: "20px", border: "1px solid #ccc", borderRadius: "8px", display: "inline-block" }}>
        <p style={{ color: "#666", margin: "0 0 10px 0" }}>The backend says:</p>
        <h2 style={{ margin: 0, color: "#2563eb" }}>{message}</h2>
      </div>

      <div style={{ padding: "20px", border: "1px solid #ccc", borderRadius: "8px", display: "inline-block" }}>
        <p>WebSocket response:</p>
        <h2 style={{ margin: 0, color: "#16a34a" }}>{wsMessage}</h2>
      </div>
    </div>
  );
}

export default App;
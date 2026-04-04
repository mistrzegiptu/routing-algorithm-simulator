import { useState, useEffect } from 'react';

function App() {
  const [message, setMessage] = useState("Loading backend data...");

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
  }, []);

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif", textAlign: "center" }}>
      <h1>React + FastAPI</h1>
      <div style={{ padding: "20px", border: "1px solid #ccc", borderRadius: "8px", display: "inline-block" }}>
        <p style={{ color: "#666", margin: "0 0 10px 0" }}>The backend says:</p>
        <h2 style={{ margin: 0, color: "#2563eb" }}>{message}</h2>
      </div>
    </div>
  );
}

export default App;
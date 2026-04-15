import { useState } from 'react';

export default function AddRouterForm({ onAdd }) {
  const [name, setName] = useState("");
  const [portNumber, setPortNumber] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {};
    if (name.trim()) payload.name = name.trim();
    if (portNumber.trim()) payload.port_number = parseInt(portNumber, 10);

    try {
      const response = await fetch("/api/routers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Błąd tworzenia routera");
      const created = await response.json();
      onAdd(created);
      setName("");
      setPortNumber("");
    } catch (error) {
      console.error(error);
      alert("Nie udało się dodać routera.");
    }
  };

  return (
    <div style={{ marginTop: "30px", padding: "20px", border: "1px dashed #aaa", borderRadius: "8px" }}>
      <h3>Dodaj nowy router</h3>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "10px" }}>
        <input
          type="text"
          placeholder="Nazwa routera (opcjonalnie)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", flex: 1.5 }}
        />
        <input
          type="number"
          placeholder="Liczba portów (domyślnie 1)"
          value={portNumber}
          onChange={(e) => setPortNumber(e.target.value)}
          min="1"
          style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", flex: 1.5 }}
        />
        <button type="submit" style={{ padding: "8px 16px", backgroundColor: "#2563eb", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
          Dodaj
        </button>
      </form>
    </div>
  );
}
import { useState } from 'react';

export default function AddItemForm({
  title,
  namePlaceholder,
  numberPlaceholder,
  apiEndpoint,
  onAdd,
  icon: Icon
}) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {};
    if (name.trim()) payload.name = name.trim();
    if (number.trim()) payload.port_number = parseInt(number, 10);

    try {
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Błąd podczas dodawania elementu");
      const created = await response.json();
      onAdd(created);
      setName("");
      setNumber("");
    } catch (error) {
      console.error(error);
      alert("Nie udało się dodać elementu.");
    }
  };

  return (
    <div style={{ marginTop: "30px", padding: "20px", border: "1px dashed #aaa", borderRadius: "8px" }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {Icon && <Icon size={20} />} {title}
      </h3>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "10px" }}>
        <input
          type="text"
          placeholder={namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", flex: 1.5 }}
        />
        <input
          type="number"
          placeholder={numberPlaceholder}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
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
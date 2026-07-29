import { useState } from 'react';
import { createDevice } from '../api/device_api.js';
import './AddItemForm.css';

export default function AddItemForm({
  label,
  namePlaceholder,
  deviceType,
  iconSrc,
  accentVar = "--accent",
  onAdd
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const created = await createDevice({
        name: name.trim(),
        type: deviceType,
      });
      onAdd(created);
      setName("");
    } catch (error) {
      console.error(error);
      alert("Nie udało się dodać urządzenia.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="add-item"
      style={{ "--card-accent": `var(${accentVar})` }}
    >
      <div className="add-item__head">
        {iconSrc && <img className="add-item__icon" src={iconSrc} alt={deviceType} />}
        <span className="add-item__label">{label}</span>
      </div>
      <div className="add-item__row">
        <input
          type="text"
          className="add-item__input"
          placeholder={namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          className="add-item__btn"
          disabled={busy}
          title={`Dodaj ${label.toLowerCase()}`}
          aria-label={`Dodaj ${label.toLowerCase()}`}
        >
          <svg className="add-item__btn-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </form>
  );
}

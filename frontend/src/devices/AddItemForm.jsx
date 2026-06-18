import { useState } from 'react';
import { createDevice } from '../api/device_api.js';
import './AddItemForm.css';

export default function AddItemForm({
  title,
  namePlaceholder,
  numberPlaceholder,
  deviceType,
  iconSrc,
  onAdd
}) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const created = await createDevice({
        name: name.trim(),
        port_number: number.trim() ? parseInt(number, 10) : 1,
        type: deviceType,
      });
      onAdd(created);
      setName("");
      setNumber("");
    } catch (error) {
      console.error(error);
      alert("Nie udało się dodać urządzenia.");
    }
  };

  return (
    <div className="add-item-form">
      <h3 className="add-item-form__title">
        {iconSrc && <img className="add-item-form__icon" src={iconSrc} alt={deviceType} />} {title}
      </h3>
      <form onSubmit={handleSubmit} className="add-item-form__form">
        <input
          type="text"
          className="add-item-form__input"
          placeholder={namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {deviceType === "router" && <input
          type="number"
          className="add-item-form__input"
          placeholder={numberPlaceholder}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          min="1"
        />}
        <button type="submit" className="add-item-form__submit">
          Dodaj
        </button>
      </form>
    </div>
  );
}

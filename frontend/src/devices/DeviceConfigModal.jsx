import { useState, useEffect } from 'react';
import '../styles/modal.css';
import './DeviceConfigModal.css';

export default function DeviceConfigModal({ device, onClose, onSave }) {
  const [name, setName] = useState("");
  const [ports, setPorts] = useState([]);

  useEffect(() => {
    if (device) {
      setName(device.name || "");
      setPorts(Array.isArray(device.ports) ? device.ports.map(p => ({ ...p })) : []);
    }
  }, [device]);

  if (!device) return null;

  const handlePortChange = (index, field, value) => {
    setPorts(prev => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const formattedPorts = ports.map(p => ({
      ...p,
      mask: parseInt(p.mask, 10) || 24,
    }));
    onSave(device.id, { name, ports: formattedPorts });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Zamknij">×</button>

        <h2 className="modal-title">Konfiguracja urządzenia</h2>
        <span className={`device-type-badge device-type-badge--${device.type}`}>
          {device.type === 'router' ? 'Router' : 'Komputer'}
        </span>

        <form onSubmit={handleSubmit} className="modal-form">
          <label className="modal-field">
            <span className="modal-label">Nazwa</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="config-ports">
            <div className="config-ports__head">
              Interfejsy <span className="config-ports__count">{ports.length}</span>
            </div>

            {ports.length === 0 && (
              <p className="config-ports__empty">
                Brak interfejsów. Powstaną automatycznie przy dodaniu połączenia.
              </p>
            )}

            {ports.map((port, index) => (
              <div key={index} className="config-port">
                <div className="config-port__tag">eth{index}</div>
                <div className="config-port__inputs">
                  <label className="config-port__field config-port__field--ip">
                    <span className="config-port__label">Adres IP</span>
                    <input
                      type="text"
                      value={port.ip || ''}
                      onChange={(e) => handlePortChange(index, 'ip', e.target.value)}
                    />
                  </label>
                  <label className="config-port__field config-port__field--mask">
                    <span className="config-port__label">Maska</span>
                    <input
                      type="number"
                      min="0"
                      max="32"
                      value={port.mask ?? ''}
                      onChange={(e) => handlePortChange(index, 'mask', e.target.value)}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn--ghost" onClick={onClose}>
              Anuluj
            </button>
            <button type="submit" className="modal-btn modal-btn--primary">
              Zapisz
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

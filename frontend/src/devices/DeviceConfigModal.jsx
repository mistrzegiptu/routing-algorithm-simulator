import { useState, useEffect } from 'react';
import './DeviceConfigModal.css';

export default function DeviceConfigModal({ device, onClose, onSave }) {
  const [name, setName] = useState("");
  const [ports, setPorts] = useState([]);

  useEffect(() => {
    if (device) {
      setName(device.name || "");
      setPorts(Array.isArray(device.ports) ? [...device.ports] : []);
    }
  }, [device]);

  if (!device) return null;

  const handlePortChange = (index, field, value) => {
    const updatedPorts = [...ports];
    updatedPorts[index] = { ...updatedPorts[index], [field]: value };
    setPorts(updatedPorts);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const formattedPorts = ports.map(p => ({
      ...p,
      mask: parseInt(p.mask, 10) || 24
    }));
    onSave(device.id, { name, ports: formattedPorts });
  };

  return (
    <div className="device-config-overlay">
      <div className="device-config-window">
        <h3>Konfiguracja: {device.name}</h3>

        <form onSubmit={handleSubmit} className="device-config-form">
          <div>
            <label className="device-config-label">Nazwa urządzenia</label>
            <input
              type="text"
              className="device-config-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="device-config-ports">
            <h4>Interfejsy ({ports.length})</h4>

            {ports.map((port, index) => (
              <div key={index} className="device-config-port-row">
                <div className="device-config-port-ip">
                  <label className="device-config-port-label">IP (Port {index + 1})</label>
                  <input
                    type="text"
                    className="device-config-port-input"
                    value={port.ip || ''}
                    onChange={(e) => handlePortChange(index, 'ip', e.target.value)}
                  />
                </div>
                <div className="device-config-port-mask">
                  <label className="device-config-port-label">Maska</label>
                  <input
                    type="number"
                    className="device-config-port-input"
                    min="0"
                    max="32"
                    value={port.mask || ''}
                    onChange={(e) => handlePortChange(index, 'mask', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="device-config-actions">
            <button type="button" className="device-config-btn device-config-btn--cancel" onClick={onClose}>
              Anuluj
            </button>
            <button type="submit" className="device-config-btn device-config-btn--save">
              Zapisz
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

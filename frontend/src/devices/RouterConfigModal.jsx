import { useState, useEffect } from 'react';

export default function RouterConfigModal({ router, onClose, onSave }) {
  const [name, setName] = useState("");
  const [ports, setPorts] = useState(1);

  useEffect(() => {
    if (router) {
      setName(router.name || "");
      if (router.ports && Array.isArray(router.ports)) {
        setPorts([...router.ports]);
      } else {
        setPorts([]);
      }
    }
  }, [router]);

  if (!router) return null;

  const handlePortChange = (index, field, value) => {
    const updatedPorts = [...ports];
    updatedPorts[index] = { ...updatedPorts[index], [field]: value };
    setPorts(updatedPorts);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const formattedPorts = (Array.isArray(ports) ? ports : []).map(p => ({
      ...p,
      mask: parseInt(p.mask, 10) || 24
    }));
    onSave(router.id, { name, ports: formattedPorts });
  };

  const safePorts = Array.isArray(ports) ? ports : [];

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000
    }}>
      <div style={{
        backgroundColor: '#1e1e2f', padding: '24px', borderRadius: '8px',
        border: '1px solid #444', width: '380px', color: 'white',
        maxHeight: '80vh', overflowY: 'auto'
      }}>
        <h3 style={{ marginTop: 0 }}>Konfiguracja: {router.name}</h3>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Nazwa routera</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#2a2a3f', color: 'white', boxSizing: 'border-box' }}
            />
          </div>
          
          <div style={{ borderTop: '1px solid #444', paddingTop: '12px' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>Interfejsy ({safePorts.length})</h4>
            
            { }
            {safePorts.map((port, index) => (
              <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <div style={{ flex: 2 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#aaa' }}>IP (Port {index + 1})</label>
                  <input
                    type="text"
                    value={port.ip || ''}
                    onChange={(e) => handlePortChange(index, 'ip', e.target.value)}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#2a2a3f', color: 'white', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#aaa' }}>Maska</label>
                  <input
                    type="number"
                    min="0"
                    max="32"
                    value={port.mask || ''}
                    onChange={(e) => handlePortChange(index, 'mask', e.target.value)}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#2a2a3f', color: 'white', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <button 
              type="button" 
              onClick={onClose}
              style={{ padding: '8px 16px', backgroundColor: '#555', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Anuluj
            </button>
            <button 
              type="submit"
              style={{ padding: '8px 16px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Zapisz
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
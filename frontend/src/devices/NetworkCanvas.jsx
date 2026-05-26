import { useState } from 'react';
import DraggableDevice from './DraggableDevice';

export default function NetworkCanvas({ devices, onUpdateDevicePosition }) {
  const [topmostId, setTopmostId] = useState(null);

  const handleDragStart = (id) => {
    setTopmostId(id);
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '80%',
        minWidth: '800px',
        margin: '30px auto 0',
        height: '70vh',
        backgroundColor: '#1e1e2f',
        borderRadius: '12px',
        boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}
    >
      {devices.map((device) => (
        <DraggableDevice
          key={device.id}
          device={device}
          onPositionChange={onUpdateDevicePosition}
          onDragStart={handleDragStart}
          zIndex={device.id === topmostId ? 1000 : 1}
        />
      ))}
    </div>
  );
}
import { useState } from 'react';
import DraggableDevice from './DraggableDevice';
import { useCanvas } from '../context/CanvasContext.jsx';
import './NetworkCanvas.css';

export default function NetworkCanvas({ devices, links, onUpdateDevicePosition, onSelectDevice }) {
  const [topmostId, setTopmostId] = useState(null);
  const { deviceSize = {} } = useCanvas();

  const handleDragStart = (id) => {
    setTopmostId(id);
  };

  return (
    <div className="network-canvas">
      <svg className="sim-area">
        {links.map(link => {
          const source = devices.find(d => d.id === link.sourceId);
          const destination = devices.find(d => d.id === link.destId);

          if (!source || !destination) return null;

          const halfWidth = (deviceSize.width || 0) / 2;
          const halfHeight = (deviceSize.height || 0) / 2;
          const sourceX = source.x + halfWidth;
          const sourceY = source.y + halfHeight;
          const destinationX = destination.x + halfWidth;
          const destinationY = destination.y + halfHeight;

          return (
            <line
              key={link.id ?? `${link.sourceId}-${link.destId}`}
              x1={sourceX}
              y1={sourceY}
              x2={destinationX}
              y2={destinationY}
              stroke="#4ade80"
              strokeWidth="2"
            />
          );
        })}
      </svg>

      {devices.map((device) => (
        <DraggableDevice
          key={device.id}
          device={device}
          onPositionChange={onUpdateDevicePosition}
          onDragStart={handleDragStart}
          onSelectDevice={onSelectDevice}
          zIndex={device.id === topmostId ? 1000 : 1}
        />
      ))}
    </div>
  );
}

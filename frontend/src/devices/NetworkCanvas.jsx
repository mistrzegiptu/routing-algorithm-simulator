import { useState } from 'react';
<<<<<<< HEAD:frontend/src/devices/RouterCanvas.jsx
import DraggableRouter from './DraggableRouter';
import { useCanvas } from '../context/CanvasContext.jsx';
import './RouterCanvas.css';


export default function RouterCanvas({ routers, links, onUpdateRouterPosition, onSelectRouter }) {
=======
import DraggableDevice from './DraggableDevice';

export default function NetworkCanvas({ devices, onUpdateDevicePosition, onUpdateDeviceName }) {
>>>>>>> d797500dbe312efdf62b83da9839a3da35f75411:frontend/src/devices/NetworkCanvas.jsx
  const [topmostId, setTopmostId] = useState(null);
  const { routerSize = {} } = useCanvas();

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
<<<<<<< HEAD:frontend/src/devices/RouterCanvas.jsx

      <svg className="sim-area">
        {links.map(link => {
          const source = routers.find(r => r.id === link.sourceId);
          const destination = routers.find(r => r.id === link.destId);

          if (!source || !destination) return null;

          const sourceX = source.x + (routerSize.width || 0) / 2;
          const sourceY = source.y + (routerSize.height || 0) / 2;
          const destinationX = destination.x + (routerSize.width || 0) / 2;
          const destinationY = destination.y + (routerSize.height || 0) / 2;

          return <line x1={sourceX} y1={sourceY} x2={destinationX} y2={destinationY} stroke="#4ade80" strokeWidth="2" />;
        })}
      </svg>
      {routers.map((router) => (
        <DraggableRouter
          key={router.id}
          router={router}
          onPositionChange={onUpdateRouterPosition}
          onDragStart={handleDragStart}
          onSelectRouter={onSelectRouter}
          zIndex={router.id === topmostId ? 1000 : 1}
=======
      {devices.map((device) => (
        <DraggableDevice
          key={device.id}
          device={device}
          onPositionChange={onUpdateDevicePosition}
          onDragStart={handleDragStart}
          zIndex={device.id === topmostId ? 1000 : 1}
          onNameChange={onUpdateDeviceName}
>>>>>>> d797500dbe312efdf62b83da9839a3da35f75411:frontend/src/devices/NetworkCanvas.jsx
        />
      ))}
    </div>
  );
}
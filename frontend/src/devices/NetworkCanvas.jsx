import { useState } from 'react';
import DraggableDevice from './DraggableDevice';
import PingAnimation from '../models/PingAnimation.jsx';
import { useCanvas } from '../context/CanvasContext.jsx';
import './NetworkCanvas.css';

export default function NetworkCanvas({
  devices,
  links,
  onUpdateDevicePosition,
  onSelectDevice,
  highlightedLinkIds = [],
  pingHops = null,
  pingAnimating = false,
  onPingAnimationComplete = null,
}) {
  const [topmostId, setTopmostId] = useState(null);
  const { deviceSize = {} } = useCanvas();

  const handleDragStart = (id) => {
    setTopmostId(id);
  };

  return (
    <div className="network-canvas">
      <svg className="sim-area">
        {/* SVG filter for highlighted link glow */}
        <defs>
          <filter id="link-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

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

          const isHighlighted = highlightedLinkIds.includes(link.id);

          return (
            <line
              key={link.id ?? `${link.sourceId}-${link.destId}`}
              x1={sourceX}
              y1={sourceY}
              x2={destinationX}
              y2={destinationY}
              stroke={isHighlighted ? '#38bdf8' : '#4ade80'}
              strokeWidth={isHighlighted ? 3.5 : 2}
              strokeOpacity={isHighlighted ? 1 : (highlightedLinkIds.length > 0 ? 0.3 : 1)}
              filter={isHighlighted ? 'url(#link-glow)' : undefined}
              className={isHighlighted ? 'link-highlighted' : ''}
            />
          );
        })}

        {/* Ping animation layer */}
        {pingAnimating && pingHops && (
          <PingAnimation
            hops={pingHops}
            devices={devices}
            deviceSize={deviceSize}
            onComplete={onPingAnimationComplete}
          />
        )}
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

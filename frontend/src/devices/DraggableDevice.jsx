import { useState, useRef, useEffect } from 'react';
import DeviceComponent from './DeviceComponent';

export default function DraggableDevice({ device, onPositionChange, onDragStart, zIndex, onNameChange }) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const elementRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (elementRef.current) {
      canvasRef.current = elementRef.current.parentElement;
    }
  }, []);

  const handleImageMouseDown = (e) => {
    e.preventDefault();
    const element = elementRef.current;
    const canvas = canvasRef.current;
    if (!element || !canvas) return;

    const elementRect = element.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const offsetX = e.clientX - elementRect.left;
    const offsetY = e.clientY - elementRect.top;

    setDragOffset({ x: offsetX, y: offsetY });
    onDragStart(device.id);
    setIsDragging(true);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const element = elementRef.current;
    if (!element) return;

    let newX = e.clientX - canvasRect.left - dragOffset.x;
    let newY = e.clientY - canvasRect.top - dragOffset.y;

    const maxX = canvasRect.width - element.offsetWidth;
    const maxY = canvasRect.height - element.offsetHeight;
    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    onPositionChange(device.id, newX, newY);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  return (
    <div
      ref={elementRef}
      style={{
        position: 'absolute',
        left: device.x,
        top: device.y,
        cursor: isDragging ? 'grabbing' : 'default',
        zIndex: zIndex,
        userSelect: 'none',
        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))',
      }}
    >
      <DeviceComponent
        deviceData={device}
        onImageMouseDown={handleImageMouseDown}
        isDragging={isDragging}
        onNameChange={onNameChange}
      />
    </div>
  );
}
import { useState, useRef, useEffect } from 'react';
import DeviceComponent from './DeviceComponent';
import { useCanvas } from '../context/CanvasContext.jsx';

export default function DraggableDevice({ device, onPositionChange, onDragStart, onSelectDevice, zIndex }) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const elementRef = useRef(null);
  const canvasRef = useRef(null);
  const { registerSize } = useCanvas();

  useEffect(() => {
    if (elementRef.current) {
      canvasRef.current = elementRef.current.parentElement;
      registerSize(elementRef.current.offsetWidth, elementRef.current.offsetHeight);
    }
  }, []);

  const handleImageMouseDown = (e) => {
    e.preventDefault();
    const element = elementRef.current;
    const canvas = canvasRef.current;
    if (!element || !canvas) return;

    const elementRect = element.getBoundingClientRect();

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
      className="draggable-device"
      style={{
        left: device.x,
        top: device.y,
        cursor: isDragging ? 'grabbing' : 'default',
        zIndex: zIndex,
      }}
    >
      <DeviceComponent
        deviceData={device}
        onImageMouseDown={handleImageMouseDown}
        isDragging={isDragging}
        onDoubleClick={() => onSelectDevice(device.id)}
      />
    </div>
  );
}

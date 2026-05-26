import { useState } from 'react';
import routerImg from '../../images/router.png';
import computerImg from '../../images/computer.png';

export default function DeviceComponent({ deviceData, onImageMouseDown, isDragging, onNameChange }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(deviceData?.name || "");

  if (!deviceData) return <div className="text-white">Loading device...</div>;

  const imageSrc = deviceData.type === 'computer' ? computerImg : routerImg;
  const detailLabel = `Porty: ${deviceData.port_number}`;

  const handleDoubleClick = () => {
    setEditName(deviceData.name || "");
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    if (editName.trim() && editName.trim() !== deviceData.name) {
      onNameChange(deviceData.id, editName.trim());
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setEditName(deviceData.name || "");
      setIsEditing(false);
    }
  };

  return (
    <div className="flex flex-col items-center p-4">
      <img
        src={imageSrc}
        alt={deviceData.type}
        className="w-40 h-40 object-contain"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={onImageMouseDown}
        draggable={false}
      />

      <div className="mt-4 flex flex-col items-center text-center text-white w-full" style={{ minWidth: '200px' }}>

        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            autoFocus
            style={{
              color: '#fff',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: '1.25rem',
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              width: '100%',
              padding: '0',
              margin: '0'
            }}
          />
        ) : (
          <h2
            onDoubleClick={handleDoubleClick}
            title="Kliknij dwukrotnie, aby zmienić nazwę"
            style={{
              color: '#fff',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: '1.25rem',
              width: '100%',
              padding: '0',
              margin: '0',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            {deviceData.name || `Urządzenie (${deviceData.type})`}
          </h2>
        )}

        <p className="text-sm mt-1 opacity-80">{detailLabel}</p>
      </div>
    </div>
  );
}
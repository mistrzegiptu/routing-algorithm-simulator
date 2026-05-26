import routerImg from '../../images/router.png';
import computerImg from '../../images/computer.png';

export default function DeviceComponent({ deviceData, onImageMouseDown, isDragging }) {
  if (!deviceData) return <div className="text-white">Loading device...</div>;

  const imageSrc = deviceData.type === 'computer' ? computerImg : routerImg;

  //Placeholder do testów
  const detailLabel = `Porty: ${deviceData.port_number}`;

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
      <div className="mt-4 text-center text-white">
        <h2 className="text-xl font-bold">{deviceData.name || `Urządzenie (${deviceData.type})`}</h2>
        <p className="text-sm">{detailLabel}</p>
      </div>
    </div>
  );
}
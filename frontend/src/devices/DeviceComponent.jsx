import routerImg from '../../images/router.png';
import computerImg from '../../images/computer.png';

const DEVICE_IMAGES = {
  router: routerImg,
  computer: computerImg,
};

export default function DeviceComponent({ deviceData, onImageMouseDown, isDragging, onDoubleClick }) {
  if (!deviceData) return <div className="text-white">Loading device...</div>;

  const imageSrc = DEVICE_IMAGES[deviceData.type] || routerImg;

  return (
    <div
      className="flex flex-col items-center p-4"
      onDoubleClick={onDoubleClick}
      title="Kliknij dwukrotnie, aby skonfigurować"
    >
      <img
        src={imageSrc}
        alt={deviceData.type}
        className="w-40 h-40 object-contain"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={onImageMouseDown}
        draggable={false}
      />

      <div className="mt-4 text-center text-white" style={{ userSelect: 'none' }}>
        <h2 className="text-xl font-bold">
          {deviceData.name || `Urządzenie (${deviceData.type})`}
        </h2>
        <p className="text-sm mt-1 opacity-80">Porty: {deviceData.port_number}</p>
      </div>
    </div>
  );
}

import routerImg from '../../images/router.png';

export default function RouterComponent({ routerData, onImageMouseDown, isDragging, onDoubleClick }) {
  if (!routerData) return <div className="text-white">Loading router...</div>;

  return (
    <div className="flex flex-col items-center p-4"
      onDoubleClick={onDoubleClick}>
      <img
        src={routerImg}
        alt="Router"
        className="w-40 h-40 object-contain"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={onImageMouseDown}
        draggable={false}
      />
      <div className="mt-4 text-center text-white">
        <h2 className="text-xl font-bold">{routerData.name}</h2>
        <p className="text-sm">Porty: {routerData.port_number}</p>
      </div>
    </div>
  );
}
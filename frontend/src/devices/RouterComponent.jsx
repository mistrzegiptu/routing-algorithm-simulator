import routerImg from "../../images/router.png";

export default function RouterComponent({ routerData }) {
  if (!routerData) return <div>Loading router...</div>;

  return (
    <div className="flex flex-col items-center p-4">
      <img src={routerImg} alt="Router" className="w-40 h-40 object-contain" />
      <div className="mt-4 text-center">
        <h2 className="text-xl font-bold">{routerData.name}</h2>
        <p className="text-sm text-gray-600">Liczba portów: {routerData.port_number}</p>
      </div>
    </div>
  );
}
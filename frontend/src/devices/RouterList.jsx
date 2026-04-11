import RouterComponent from './RouterComponent';

export default function RouterList({ routers }) {
  return (
    <div style={{ marginTop: "30px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "20px" }}>
      {routers.map((router) => (
        <RouterComponent key={router.id} routerData={router} />
      ))}
    </div>
  );
}
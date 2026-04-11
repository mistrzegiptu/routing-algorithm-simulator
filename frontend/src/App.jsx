import { useState, useEffect } from 'react';
import RouterList from "./devices/RouterList.jsx";
import AddRouterForm from "./devices/AddRouterForm.jsx";

function App() {
  const [routers, setRouters] = useState([]);


  const handleAddRouter = (newRouter) => {
    setRouters(prev => [...prev, newRouter]);
  };

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif", textAlign: "center" }}>
      <h1>Routing Algorithms Simulator</h1>
      <AddRouterForm onAdd={handleAddRouter} />
      <RouterList routers={routers} />
    </div>
  );
}

export default App;
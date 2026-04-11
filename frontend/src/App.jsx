import { useState, useEffect } from 'react';
import AddRouterForm from "./devices/AddRouterForm.jsx";
import RouterCanvas from "./devices/RouterCanvas.jsx";

function App() {
  const [routers, setRouters] = useState([]);


  const handleAddRouter = (newRouter) => {
      setRouters(prev => [
        ...prev,
        {
          ...newRouter,
          x: 100,
          y: 100,
        }
      ]);
    };

  const handleUpdateRouterPosition = (id, x, y) => {
    setRouters(prev =>
      prev.map(r => (r.id === id ? { ...r, x, y } : r))
    );
  };

  return (
     <div style={{minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '20px', boxSizing: 'border-box'}}>
      <h1>Routing Algorithms Simulator</h1>
      <AddRouterForm onAdd={handleAddRouter} />
      <RouterCanvas
        routers={routers}
        onUpdateRouterPosition={handleUpdateRouterPosition}
      />
    </div>
  );
}

export default App;
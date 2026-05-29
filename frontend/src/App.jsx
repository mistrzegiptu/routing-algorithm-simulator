import { useState, useEffect } from 'react';
import AddRouterForm from "./devices/AddRouterForm.jsx";
import RouterCanvas from "./devices/RouterCanvas.jsx";
import RouterConfigModal from "./devices/RouterConfigModal.jsx";

function App() {
  const [routers, setRouters] = useState([]);
  const [selectedRouterId, setSelectedRouterId] = useState(null);

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

const handleSelectRouter = (id) => {
    setSelectedRouterId(id);
  };

  const handleCloseConfig = () => {
    setSelectedRouterId(null);
  };

  const handleSaveConfig = async (id, updatedData) => {
    try {
      const response = await fetch(`/api/routers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        let errorMessage = errorData.detail;

        if (Array.isArray(errorMessage)) {
          errorMessage = errorMessage
            .map(err => {
              const cleanMsg = err.msg.replace("Value error, ", "");
              return `- Pole "${err.loc[err.loc.length - 1]}": ${cleanMsg}`;
            })
            .join('\n');
            
        } else if (typeof errorMessage === 'string') {
          const lowerError = errorMessage.toLowerCase();
          
          if (lowerError.includes("already in use")) {
            errorMessage = "This IP address is already assigned to another interface. Please use a unique address.";
          } else if (lowerError.includes("does not exist")) {
            errorMessage = "Port does not exist.";
          }
          
        } else if (typeof errorMessage === 'object') {
          errorMessage = JSON.stringify(errorMessage);
        }

        alert(`Configuration save failed:\n\n${errorMessage}`);
        return;
      }

      const savedRouter = await response.json();

      setRouters(prev =>
        prev.map(r => (r.id === id ? { ...r, ...savedRouter } : r))
      );
      setSelectedRouterId(null);
    } catch (error) {
      console.error(error);
      alert("Error connecting to server.");
    }
  };

  const selectedRouter = routers.find(r => r.id === selectedRouterId);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '20px', boxSizing: 'border-box' }}>
      <h1>Routing Algorithms Simulator</h1>
      <AddRouterForm onAdd={handleAddRouter} />
      <RouterCanvas
        routers={routers}
        onUpdateRouterPosition={handleUpdateRouterPosition}
        onSelectRouter={handleSelectRouter}
      />
      
      { }
      {selectedRouterId !== null && (
        <RouterConfigModal 
          router={selectedRouter} 
          onClose={handleCloseConfig} 
          onSave={handleSaveConfig} 
        />
      )}
    </div>
  );
}

export default App;
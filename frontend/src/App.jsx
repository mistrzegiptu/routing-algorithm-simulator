import { useState } from 'react';
import AddRouterForm from "./devices/AddRouterForm.jsx";
import RouterCanvas from "./devices/RouterCanvas.jsx";
import RouterConfigModal from "./devices/RouterConfigModal.jsx";
import { AddingLinkState } from "./models/AddingLinkState.js";
import AddLinkModal from "./modals/AddLinkModal.jsx";
import { CanvasProvider } from "./context/CanvasContext.jsx";
import { saveLinkRoute } from "./api/router_api.js";

function App() {
  const [routers, setRouters] = useState([]);
  const [links, setLinks] = useState([]);

  const [selectedRouterId, setSelectedRouterId] = useState(null);

  const [addingLinkState, setAddingLinkState] = useState(AddingLinkState.NORMAL);
  const [sourceRouter, setSourceRouter] = useState(null);
  const [destinationRouter, setDestinationRouter] = useState(null);

  const addLinkHandler = () => {
    if (addingLinkState === AddingLinkState.NORMAL) {
      setAddingLinkState(AddingLinkState.SELECTING_SOURCE);
      setSourceRouter(null);
      setDestinationRouter(null);
    } else {
      setAddingLinkState(AddingLinkState.NORMAL);
      setSourceRouter(null);
      setDestinationRouter(null);
    }
  }

  const handleUpdateDevicePosition = (id, x, y) => {
    setDevices(prev =>
      prev.map(d => (d.id === id ? { ...d, x, y } : d))
    );
  };

  const handleUpdateDeviceName = (id, newName) => {
    setDevices(prev =>
      prev.map(d => (d.id === id ? { ...d, name: newName } : d))
    );
  };

  const handleSelectRouter = (id) => {
    if (addingLinkState === AddingLinkState.SELECTING_SOURCE) {
      setSourceRouter(id);
      setAddingLinkState(AddingLinkState.SELECTING_DESTINATION);
      console.log("Source router selected:", id);
    } else if (addingLinkState === AddingLinkState.SELECTING_DESTINATION) {
      if (id === sourceRouter) {
        alert("Cannot select the same router as destination");
        return;
      }

      setDestinationRouter(id);
      setAddingLinkState(AddingLinkState.PORTS_SELECTED);
      console.log("Destination router selected:", id);
    } else {
      setSelectedRouterId(id);
    }
  };

  const saveLink = async (newLinkData) => {
    try {
      const savedLink = await saveLinkRoute(newLinkData);
      setLinks([...links, newLinkData]);

      setAddingLinkState(AddingLinkState.NORMAL);
      setSourceRouter(null);
      setDestinationRouter(null);
    } catch (error) {
      console.error("Error saving link:", error);
    }
  };

  const cancelLink = () => {
    setAddingLinkState(AddingLinkState.NORMAL);
    setSourceRouter(null);
    setDestinationRouter(null);
  }

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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '20px', boxSizing: 'border-box', cursor: addingLinkState === AddingLinkState.NORMAL || addingLinkState === AddingLinkState.PORTS_SELECTED ? 'default' : 'crosshair' }}>
      <h1>Routing Algorithms Simulator</h1>
      <AddRouterForm onAdd={handleAddRouter} />
      <div>{addingLinkState === AddingLinkState.SELECTING_SOURCE ? "Selecting source router" : addingLinkState === AddingLinkState.SELECTING_DESTINATION ? "Selecting destination router" : ""}</div>
      <button onClick={addLinkHandler}>
        {addingLinkState === AddingLinkState.NORMAL ? "Dodaj połączenie" : "Anuluj"}
      </button>
      <CanvasProvider>
        <RouterCanvas
          routers={routers}
          links={links}
          onUpdateRouterPosition={handleUpdateRouterPosition}
          onSelectRouter={handleSelectRouter}
        />
      </CanvasProvider>
      
      { }
      {selectedRouterId !== null && (
        <RouterConfigModal 
          router={selectedRouter} 
          onClose={handleCloseConfig} 
          onSave={handleSaveConfig} 
        />
      )}

      {addingLinkState === AddingLinkState.PORTS_SELECTED && (
        <AddLinkModal
          sourceId={sourceRouter}
          destId={destinationRouter}
          onAddLink={saveLink}
          onClose={cancelLink}
        />
      )}
    </div>
  );
}

export default App;
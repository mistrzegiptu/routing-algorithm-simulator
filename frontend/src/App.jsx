import { useState } from 'react';
import AddItemForm from "./devices/AddItemForm.jsx";
import NetworkCanvas from "./devices/NetworkCanvas.jsx";
import DeviceConfigModal from "./devices/DeviceConfigModal.jsx";
import { AddingLinkState } from "./models/AddingLinkState.js";
import AddLinkModal from "./modals/AddLinkModal.jsx";
import { CanvasProvider } from "./context/CanvasContext.jsx";
import { saveLinkRoute, updateDevice } from "./api/device_api.js";
import "./App.css";
import routerImg from "../images/router.png";
import computerImg from "../images/computer.png";

function App() {
  const [devices, setDevices] = useState([]);
  const [links, setLinks] = useState([]);

  const [selectedDeviceId, setSelectedDeviceId] = useState(null);

  const [addingLinkState, setAddingLinkState] = useState(AddingLinkState.NORMAL);
  const [sourceDevice, setSourceDevice] = useState(null);
  const [destinationDevice, setDestinationDevice] = useState(null);

  const handleAddDevice = (created) => {
    setDevices(prev => {
      const index = prev.length;
      const x = 60 + (index % 5) * 180;
      const y = 60 + Math.floor(index / 5) * 220;
      return [...prev, { ...created, x, y }];
    });
  };

  const handleUpdateDevicePosition = (id, x, y) => {
    setDevices(prev =>
      prev.map(d => (d.id === id ? { ...d, x, y } : d))
    );
  };

  const addLinkHandler = () => {
    setSourceDevice(null);
    setDestinationDevice(null);
    setAddingLinkState(
      addingLinkState === AddingLinkState.NORMAL
        ? AddingLinkState.SELECTING_SOURCE
        : AddingLinkState.NORMAL
    );
  };

  const handleSelectDevice = (id) => {
    if (addingLinkState === AddingLinkState.SELECTING_SOURCE) {
      setSourceDevice(id);
      setAddingLinkState(AddingLinkState.SELECTING_DESTINATION);
    } else if (addingLinkState === AddingLinkState.SELECTING_DESTINATION) {
      if (id === sourceDevice) {
        alert("Cannot select the same device as destination");
        return;
      }
      setDestinationDevice(id);
      setAddingLinkState(AddingLinkState.PORTS_SELECTED);
    } else {
      setSelectedDeviceId(id);
    }
  };

  const resetLinkSelection = () => {
    setAddingLinkState(AddingLinkState.NORMAL);
    setSourceDevice(null);
    setDestinationDevice(null);
  };

  const saveLink = async (newLinkData) => {
    try {
      const savedLink = await saveLinkRoute(newLinkData);
      setLinks(prev => [...prev, { ...newLinkData, id: savedLink.id }]);
      resetLinkSelection();
    } catch (error) {
      console.error("Error saving link:", error);
    }
  };

  const handleCloseConfig = () => {
    setSelectedDeviceId(null);
  };

  const handleSaveConfig = async (id, updatedData) => {
    try {
      const savedDevice = await updateDevice(id, updatedData);
      setDevices(prev =>
        prev.map(d => (d.id === id ? { ...d, ...savedDevice } : d))
      );
      setSelectedDeviceId(null);
    } catch (error) {
      let errorMessage = error.detail;

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
      } else if (errorMessage && typeof errorMessage === 'object') {
        errorMessage = JSON.stringify(errorMessage);
      } else {
        errorMessage = "Error connecting to server.";
      }

      alert(`Configuration save failed:\n\n${errorMessage}`);
    }
  };

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);
  const isSelecting =
    addingLinkState === AddingLinkState.SELECTING_SOURCE ||
    addingLinkState === AddingLinkState.SELECTING_DESTINATION;

  return (
    <div className="app-root" style={{ cursor: isSelecting ? 'crosshair' : 'default' }}>
      <h1>Routing Algorithms Simulator</h1>

      <AddItemForm
        title="Dodaj router"
        namePlaceholder="Nazwa routera"
        numberPlaceholder="Liczba portów"
        deviceType="router"
        iconSrc={routerImg}
        onAdd={handleAddDevice}
      />
      <AddItemForm
        title="Dodaj komputer"
        namePlaceholder="Nazwa komputera"
        numberPlaceholder="Liczba portów"
        deviceType="computer"
        iconSrc={computerImg}
        onAdd={handleAddDevice}
      />

      <div>
        {addingLinkState === AddingLinkState.SELECTING_SOURCE
          ? "Selecting source device"
          : addingLinkState === AddingLinkState.SELECTING_DESTINATION
            ? "Selecting destination device"
            : ""}
      </div>
      <button onClick={addLinkHandler}>
        {addingLinkState === AddingLinkState.NORMAL ? "Dodaj połączenie" : "Anuluj"}
      </button>

      <CanvasProvider>
        <NetworkCanvas
          devices={devices}
          links={links}
          onUpdateDevicePosition={handleUpdateDevicePosition}
          onSelectDevice={handleSelectDevice}
        />
      </CanvasProvider>

      {selectedDeviceId !== null && (
        <DeviceConfigModal
          device={selectedDevice}
          onClose={handleCloseConfig}
          onSave={handleSaveConfig}
        />
      )}

      {addingLinkState === AddingLinkState.PORTS_SELECTED && (
        <AddLinkModal
          sourceId={sourceDevice}
          destId={destinationDevice}
          onAddLink={saveLink}
          onClose={resetLinkSelection}
        />
      )}
    </div>
  );
}

export default App;

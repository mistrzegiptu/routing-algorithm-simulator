import { useState } from 'react';
import Sidebar from "./components/Sidebar.jsx";
import TopologyCanvas from "./devices/TopologyCanvas.jsx";
import DeviceConfigModal from "./devices/DeviceConfigModal.jsx";
import { AddingLinkState } from "./models/AddingLinkState.js";
import AddLinkModal from "./modals/AddLinkModal.jsx";
import { saveLinkRoute, updateDevice } from "./api/device_api.js";
import "./App.css";

function App() {
  const [devices, setDevices] = useState([]);
  const [links, setLinks] = useState([]);

  const [selectedDeviceId, setSelectedDeviceId] = useState(null);

  const [addingLinkState, setAddingLinkState] = useState(AddingLinkState.NORMAL);
  const [sourceDevice, setSourceDevice] = useState(null);
  const [destinationDevice, setDestinationDevice] = useState(null);

  const [showInterfaceIps, setShowInterfaceIps] = useState(true);

  const handleAddDevice = (created) => {
    setDevices(prev => {
      const index = prev.length;
      const x = 80 + (index % 5) * 200;
      const y = 80 + Math.floor(index / 5) * 180;
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
    }
  };

  const resetLinkSelection = () => {
    setAddingLinkState(AddingLinkState.NORMAL);
    setSourceDevice(null);
    setDestinationDevice(null);
  };

  const saveLink = async (newLinkData) => {
    try {
      const saved = await saveLinkRoute(newLinkData);

      // Routers may have grown a fresh interface; sync both devices' state.
      setDevices(prev =>
        prev.map(d => {
          if (saved.device_a && d.id === saved.device_a.id) return { ...d, ...saved.device_a };
          if (saved.device_b && d.id === saved.device_b.id) return { ...d, ...saved.device_b };
          return d;
        })
      );

      setLinks(prev => [...prev, {
        id: saved.id,
        sourceId: saved.device_a_id,
        destId: saved.device_b_id,
        sourcePort: saved.port_a_num,
        destPort: saved.port_b_num,
        bandwidth: saved.bandwidth,
        delay: saved.delay,
        bandwidthUnit: saved.unit,
      }]);
      resetLinkSelection();
    } catch (error) {
      console.error("Error saving link:", error);
      alert("Nie udało się dodać połączenia.");
    }
  };

  const handleCloseConfig = () => {
    setSelectedDeviceId(null);
  };

  const handleConfigureDevice = (id) => {
    if (addingLinkState === AddingLinkState.NORMAL) {
      setSelectedDeviceId(id);
    }
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

  return (
    <div className="app-root">
      <Sidebar
        onAddDevice={handleAddDevice}
        addingLinkState={addingLinkState}
        onToggleAddLink={addLinkHandler}
        showInterfaceIps={showInterfaceIps}
        onToggleInterfaceIps={() => setShowInterfaceIps(v => !v)}
      />

      <main className="app-canvas-area">
        <TopologyCanvas
          devices={devices}
          links={links}
          addingLinkState={addingLinkState}
          sourceDeviceId={sourceDevice}
          showInterfaceIps={showInterfaceIps}
          onUpdateDevicePosition={handleUpdateDevicePosition}
          onSelectDevice={handleSelectDevice}
          onConfigureDevice={handleConfigureDevice}
        />
      </main>

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
          sourceName={devices.find(d => d.id === sourceDevice)?.name}
          destName={devices.find(d => d.id === destinationDevice)?.name}
          onAddLink={saveLink}
          onClose={resetLinkSelection}
        />
      )}
    </div>
  );
}

export default App;

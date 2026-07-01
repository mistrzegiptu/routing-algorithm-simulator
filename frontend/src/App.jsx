import { useState, useCallback } from 'react';
import Sidebar from "./components/Sidebar.jsx";
import TopologyCanvas from "./devices/TopologyCanvas.jsx";
import DeviceDetailsPanel from './components/DeviceDetailsPanel.jsx';
import { AddingLinkState } from "./models/AddingLinkState.js";
import { PingState } from "./models/PingState.js";
import AddLinkModal from "./modals/AddLinkModal.jsx";
import PingResultPanel from "./modals/PingResultPanel.jsx";
import ConfirmDialog from "./modals/ConfirmDialog.jsx";

import { saveLinkRoute, updateDevice, pingDevice, deleteDevice } from "./api/device_api.js";
import "./App.css";

function App() {
  const [devices, setDevices] = useState([]);
  const [links, setLinks] = useState([]);

  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [devicePendingDeletion, setDevicePendingDeletion] = useState(null);

  const [addingLinkState, setAddingLinkState] = useState(AddingLinkState.NORMAL);
  const [sourceDevice, setSourceDevice] = useState(null);
  const [destinationDevice, setDestinationDevice] = useState(null);

  const [showInterfaceIps, setShowInterfaceIps] = useState(true);

  // Ping state
  const [pingState, setPingState] = useState(PingState.NORMAL);
  const [pingSource, setPingSource] = useState(null);
  const [pingResult, setPingResult] = useState(null);
  const [pingAnimating, setPingAnimating] = useState(false);
  const [highlightedLinkIds, setHighlightedLinkIds] = useState([]);

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

  // --- Device deletion ---
  const requestDeleteDevice = useCallback((id) => {
    setDevicePendingDeletion(id);
  }, []);

  const cancelDeleteDevice = () => setDevicePendingDeletion(null);

  const confirmDeleteDevice = async () => {
    const id = devicePendingDeletion;
    if (id === null) return;

    try {
      const result = await deleteDevice(id);
      const removedLinkIds = result.removed_link_ids || [];

      setDevices(prev => prev.filter(d => d.id !== id));
      setLinks(prev =>
        prev.filter(l =>
          l.sourceId !== id && l.destId !== id && !removedLinkIds.includes(l.id)
        )
      );

      // Clear any state that might still reference the removed device.
      if (selectedDeviceId === id) setSelectedDeviceId(null);
      setHighlightedLinkIds(prev => prev.filter(lid => !removedLinkIds.includes(lid)));
      if (sourceDevice === id) resetLinkSelection();
      if (pingSource === id) resetPing();
    } catch (error) {
      console.error("Error deleting device:", error);
      alert("Nie udało się usunąć urządzenia.");
    } finally {
      setDevicePendingDeletion(null);
    }
  };

  const addLinkHandler = () => {
    // Cancel ping mode if active
    if (pingState !== PingState.NORMAL) {
      resetPing();
    }
    setSourceDevice(null);
    setDestinationDevice(null);
    setAddingLinkState(
      addingLinkState === AddingLinkState.NORMAL
        ? AddingLinkState.SELECTING_SOURCE
        : AddingLinkState.NORMAL
    );
  };

  // --- Ping handlers ---
  const pingHandler = () => {
    // Cancel link mode if active
    if (addingLinkState !== AddingLinkState.NORMAL) {
      resetLinkSelection();
    }

    if (pingState === PingState.NORMAL) {
      setPingSource(null);
      setPingResult(null);
      setPingAnimating(false);
      setHighlightedLinkIds([]);
      setPingState(PingState.SELECTING_SOURCE);
    } else {
      resetPing();
    }
  };

  const resetPing = () => {
    setPingState(PingState.NORMAL);
    setPingSource(null);
    setPingResult(null);
    setPingAnimating(false);
    setHighlightedLinkIds([]);
  };

  const executePing = async (sourceId, targetId) => {
    try {
      const result = await pingDevice(sourceId, targetId);
      setPingResult(result);

      if (result.success && result.hops.length > 0) {
        const linkIds = result.hops
          .map(hop => hop.link_id)
          .filter(id => id !== null && id !== undefined);
        setHighlightedLinkIds(linkIds);

        setPingAnimating(true);
        setPingState(PingState.ANIMATING);
      } else {
        setPingState(PingState.DONE);
      }
    } catch (error) {
      console.error("Ping error:", error);
      setPingResult({
        success: false,
        path: [],
        hops: [],
        total_delay: 0,
        hop_count: 0,
        message: `Error: ${error.message}`,
      });
      setPingState(PingState.DONE);
    }
  };

  const handlePingAnimationComplete = useCallback(() => {
    setPingAnimating(false);
    setPingState(PingState.DONE);
  }, []);

  const handlePingReplay = () => {
    if (pingResult && pingResult.success && pingResult.hops.length > 0) {
      setPingAnimating(true);
      setPingState(PingState.ANIMATING);
    }
  };

  const handleSelectDevice = (id) => {
    // Ping mode takes priority when active
    if (pingState === PingState.SELECTING_SOURCE) {
      setPingSource(id);
      setPingState(PingState.SELECTING_DESTINATION);
      return;
    }
    if (pingState === PingState.SELECTING_DESTINATION) {
      if (id === pingSource) {
        alert("Nie można pingować tego samego urządzenia");
        return;
      }
      executePing(pingSource, id);
      return;
    }

    // Link mode
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
    if (addingLinkState === AddingLinkState.NORMAL && pingState === PingState.NORMAL) {
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

  const pendingDevice = devices.find(d => d.id === devicePendingDeletion);
  const pendingDeviceLinkCount = pendingDevice
    ? links.filter(l => l.sourceId === pendingDevice.id || l.destId === pendingDevice.id).length
    : 0;

  return (
    <div className="app-root">
      <Sidebar
        onAddDevice={handleAddDevice}
        addingLinkState={addingLinkState}
        onToggleAddLink={addLinkHandler}
        showInterfaceIps={showInterfaceIps}
        onToggleInterfaceIps={() => setShowInterfaceIps(v => !v)}
        pingState={pingState}
        onTogglePing={pingHandler}
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
          onRequestDeleteDevice={requestDeleteDevice}
          pingState={pingState}
          pingSourceId={pingSource}
          highlightedLinkIds={highlightedLinkIds}
          pingHops={pingResult?.hops || null}
          pingAnimating={pingAnimating}
          onPingAnimationComplete={handlePingAnimationComplete}
        />
      </main>

      {selectedDeviceId !== null && (
        <DeviceDetailsPanel
          device={selectedDevice}
          onClose={handleCloseConfig}
          onSave={handleSaveConfig}
          onDelete={requestDeleteDevice}
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

      {pingState === PingState.DONE && pingResult && (
        <PingResultPanel
          pingResult={pingResult}
          onReplay={handlePingReplay}
          onClose={resetPing}
        />
      )}

      {pendingDevice && (
        <ConfirmDialog
          title="Usunąć urządzenie?"
          message={
            <>
              Urządzenie <strong>{pendingDevice.name}</strong> zostanie trwale usunięte
              {pendingDeviceLinkCount > 0 && (
                <> wraz z {pendingDeviceLinkCount} {pendingDeviceLinkCount === 1 ? "połączeniem" : "połączeniami"}</>
              )}
              . Tej operacji nie można cofnąć.
            </>
          }
          confirmLabel="Usuń"
          danger
          onConfirm={confirmDeleteDevice}
          onCancel={cancelDeleteDevice}
        />
      )}
    </div>
  );
}

export default App;

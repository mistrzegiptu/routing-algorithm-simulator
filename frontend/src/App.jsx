import { useState, useCallback, useRef, useEffect } from 'react';
import Sidebar from "./components/Sidebar.jsx";
import SimulationSidebar from "./components/SimulationSidebar.jsx";
import TopologyCanvas from "./devices/TopologyCanvas.jsx";
import DeviceDetailsPanel from './components/DeviceDetailsPanel.jsx';
import { AddingLinkState } from "./models/AddingLinkState.js";
import { AppMode } from "./models/AppMode.js";
import { PingState } from "./models/PingState.js";
import EditLinkModal from "./modals/EditLinkModal.jsx";
import PingResultPanel from "./modals/PingResultPanel.jsx";
import ConfirmDialog from "./modals/ConfirmDialog.jsx";

import { saveLinkRoute, updateLink, deleteLink, updateDevice, pingDevice, deleteDevice, exportNetwork } from "./api/device_api.js";
import "./App.css";

function App() {
  const [devices, setDevices] = useState([]);
  const [links, setLinks] = useState([]);

  useEffect(() => {
    const fetchInitData = async () => {
      try {
        const res = await exportNetwork();

        if (!res || !res.devices_db) return;

        const spawn = canvasRef.current?.getSpawnPosition();
        const radius = Math.max(150, res.devices_db.length * 30)
        
        const newDevices = res.devices_db.map((d, index) => {
          const angle = (index / res.devices_db.length) * 2 * Math.PI;
          return {
            ...d,
            x: spawn.x + radius * Math.cos(angle) - 48,
            y: spawn.y + radius * Math.sin(angle) - 30,
          };
        });

        const newLinks = res.links_db.map(l => ({
          id: l.id,
          sourceId: l.device_a,
          destId: l.device_b,
          sourcePort: l.port_a_num,
          destPort: l.port_b_num,
          bandwidth: l.bandwidth,
          delay: l.delay,
          bandwidthUnit: l.unit,
          weight: l.weight,
        }));

        setDevices(newDevices);
        setLinks(newLinks);

        console.log("Imported devices:", newDevices);
      } catch (err) {
        console.error(err);
      }
    };

    fetchInitData();
  }, []);

  const importHandler = (importedDevices, importedLinks) => {
    const spawn = canvasRef.current?.getSpawnPosition();
    const radius = Math.max(150, importedDevices.length * 30)

    const newDevices = importedDevices.map((d, index) => {
      const angle = (index / importedDevices.length) * 2 * Math.PI;
      return {
        ...d,
        x: spawn.x + radius * Math.cos(angle) - 48,
        y: spawn.y + radius * Math.sin(angle) - 30,
      };
    });

    const newLinks = importedLinks.map(l => ({
      id: l.id,
      sourceId: l.device_a,
      destId: l.device_b,
      sourcePort: l.port_a_num,
      destPort: l.port_b_num,
      bandwidth: l.bandwidth,
      delay: l.delay,
      bandwidthUnit: l.unit,
    }));

    setDevices(newDevices);
    setLinks(newLinks);

    console.log("Imported links:", newLinks);
  }

  const [appMode, setAppMode] = useState(AppMode.BUILD);

  // Simulation-screen state: interactive ping picking on a running world.
  const simSidebarRef = useRef(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simPingSourceId, setSimPingSourceId] = useState(null);
  const [simState, setSimState] = useState('idle');
  const [simSpeed, setSimSpeed] = useState(0.1);
  const [simSegments, setSimSegments] = useState({});

  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [devicePendingDeletion, setDevicePendingDeletion] = useState(null);
  const [selectedLinkId, setSelectedLinkId] = useState(null);

  const [addingLinkState, setAddingLinkState] = useState(AddingLinkState.NORMAL);
  const [sourceDevice, setSourceDevice] = useState(null);

  const [showInterfaceIps, setShowInterfaceIps] = useState(true);

  // Ping state
  const [pingState, setPingState] = useState(PingState.NORMAL);
  const [pingSource, setPingSource] = useState(null);
  const [pingResult, setPingResult] = useState(null);
  const [pingAnimating, setPingAnimating] = useState(false);
  const [highlightedLinkIds, setHighlightedLinkIds] = useState([]);

  const canvasRef = useRef(null);

  const handleAddDevice = (created) => {
    setDevices(prev => {
      // Fan consecutive additions out slightly so they don't stack perfectly.
      const jitter = (prev.length % 6) * 24 - 60;
      const spawn = canvasRef.current?.getSpawnPosition();

      if (spawn) {
        // Center of the visible viewport; offset to center the node itself (~96×60).
        return [...prev, {
          ...created,
          x: spawn.x - 48 + jitter,
          y: spawn.y - 30 + jitter,
        }];
      }

      // Fallback grid if the canvas instance isn't ready yet.
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
      const updatedDevices = result.updated_devices || [];
      const updatedLinks = result.updated_links || [];

      // Peers (routers) may have shrunk an interface; merge their fresh state.
      setDevices(prev =>
        prev
          .filter(d => d.id !== id)
          .map(d => {
            const u = updatedDevices.find(x => x.id === d.id);
            return u ? { ...d, ...u } : d;
          })
      );
      // Drop this device's links; sync interface indices on links that shifted.
      setLinks(prev =>
        prev
          .filter(l =>
            l.sourceId !== id && l.destId !== id && !removedLinkIds.includes(l.id)
          )
          .map(l => {
            const u = updatedLinks.find(x => x.id === l.id);
            return u ? { ...l, sourcePort: u.port_a_num, destPort: u.port_b_num } : l;
          })
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

    // Link mode — creating a link happens immediately on picking the second
    // device (no params modal), then the tool re-arms for the next pair so
    // many links can be made back-to-back.
    if (addingLinkState === AddingLinkState.SELECTING_SOURCE) {
      setSourceDevice(id);
      setAddingLinkState(AddingLinkState.SELECTING_DESTINATION);
    } else if (addingLinkState === AddingLinkState.SELECTING_DESTINATION) {
      if (id === sourceDevice) {
        alert("Cannot select the same device as destination");
        return;
      }
      saveLink({
        sourceId: sourceDevice,
        destId: id,
        bandwidth: 100,
        bandwidthUnit: 'Mbps',
        delay: 10,
      });
    }
  };

  const resetLinkSelection = () => {
    setAddingLinkState(AddingLinkState.NORMAL);
    setSourceDevice(null);
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
        weight: saved.weight,
      }]);
      // Re-arm for the next pair instead of exiting linking mode entirely.
      setSourceDevice(null);
      setAddingLinkState(AddingLinkState.SELECTING_SOURCE);
    } catch (error) {
      console.error("Error saving link:", error);
      alert("Nie udało się dodać połączenia.");
    }
  };

  const handleCloseConfig = () => {
    setSelectedDeviceId(null);
  };

  // --- Link editing (double-click) ---
  const requestConfigureLink = (id) => {
    if (addingLinkState === AddingLinkState.NORMAL && pingState === PingState.NORMAL) {
      setSelectedLinkId(id);
    }
  };

  const handleCloseLinkConfig = () => setSelectedLinkId(null);

  const handleSaveLinkConfig = async (id, updatedData) => {
    try {
      const saved = await updateLink(id, updatedData);
      setLinks(prev =>
        prev.map(l => (l.id === id
          ? { ...l, bandwidth: saved.bandwidth, delay: saved.delay, bandwidthUnit: saved.unit, weight: saved.weight }
          : l))
      );
      setSelectedLinkId(null);
    } catch (error) {
      console.error("Error saving link:", error);
      alert("Nie udało się zapisać połączenia.");
    }
  };

  // --- Link deletion (fast, no confirmation — a link is cheap to recreate) ---
  const requestDeleteLink = useCallback(async (id) => {
    try {
      const result = await deleteLink(id);
      const updatedDevices = result.updated_devices || [];
      const updatedLinks = result.updated_links || [];

      // Peers (routers) may have shrunk an interface; merge their fresh state.
      setDevices(prev =>
        prev.map(d => {
          const u = updatedDevices.find(x => x.id === d.id);
          return u ? { ...d, ...u } : d;
        })
      );
      // Drop this link; sync interface indices on links that shifted.
      setLinks(prev =>
        prev
          .filter(l => l.id !== id)
          .map(l => {
            const u = updatedLinks.find(x => x.id === l.id);
            return u ? { ...l, sourcePort: u.port_a_num, destPort: u.port_b_num } : l;
          })
      );

      setHighlightedLinkIds(prev => prev.filter(lid => lid !== id));
      setSelectedLinkId(prev => (prev === id ? null : prev));
    } catch (error) {
      console.error("Error deleting link:", error);
      alert("Nie udało się usunąć połączenia.");
    }
  }, []);

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

  // --- Screen mode (Buduj / Symuluj) ---
  const handleSwitchMode = (mode) => {
    if (mode === appMode) return;
    if (mode === AppMode.SIMULATE) {
      // Leave build-time tools/panels behind; the simulation canvas is read-only.
      resetPing();
      resetLinkSelection();
      setSelectedDeviceId(null);
      setSelectedLinkId(null);
      setDevicePendingDeletion(null);
    } else {
      // Leaving Symuluj unmounts its sidebar, which closes the socket and
      // ends the simulation world on the backend.
      setSimRunning(false);
      setSimPingSourceId(null);
    }
    setAppMode(mode);
  };

  // --- Simulation ping: click source, click target, packet flies ---
  const handleSimStatusChange = useCallback((state) => {
    const active = state === 'running' || state === 'paused';
    setSimState(state);
    setSimRunning(active);
    if (!active) {
      setSimPingSourceId(null);
      setSimSegments({});
    }
  }, []);

  const handleSimReset = useCallback(() => setSimSegments({}), []);

  const handleSimEvent = useCallback((ev) => {
    const id = ev.packet_id;
    if (!id) return;
    if (ev.type === 'packet_sent') {
      // Flooding forwards the same packet_id over several links at once, so the
      // link_id has to be part of the key or each copy overwrites the last one.
      const key = `${id}:${ev.link_id}`;
      const link = links.find(l => l.id === ev.link_id);
      const delay = link?.delay ?? 10;
      setSimSegments(prev => ({
        ...prev,
        [key]: {
          key,
          from_id: ev.from_id,
          to_id: ev.to_id,
          t_sent: ev.t,
          t_recv: ev.t + delay,
          kind: ev.kind,
          icmp: ev.payload?.icmp,
        },
      }));
    } else if (ev.type === 'packet_recv') {
      const key = `${id}:${ev.link_id}`;
      setSimSegments(prev => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else if (ev.type === 'packet_delivered' || ev.type === 'packet_dropped') {
      // No link_id on these events, so match the in-flight copy that was headed
      // to this node without touching sibling copies still flying elsewhere.
      setSimSegments(prev => {
        let changed = false;
        const next = {};
        for (const [k, v] of Object.entries(prev)) {
          if (k.startsWith(`${id}:`) && v.to_id === ev.node_id) {
            changed = true;
            continue;
          }
          next[k] = v;
        }
        return changed ? next : prev;
      });
    }
  }, [links]);

  const handleSimDeviceClick = (id) => {
    if (!simRunning) return;
    if (simPingSourceId === null) {
      setSimPingSourceId(id);
    } else if (id === simPingSourceId) {
      setSimPingSourceId(null);
    } else {
      simSidebarRef.current?.sendPing(simPingSourceId, id);
      setSimPingSourceId(null);
    }
  };

  const handleSimPaneClick = () => setSimPingSourceId(null);

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);
  const selectedLink = links.find(l => l.id === selectedLinkId);

  const pendingDevice = devices.find(d => d.id === devicePendingDeletion);
  const pendingDeviceLinkCount = pendingDevice
    ? links.filter(l => l.sourceId === pendingDevice.id || l.destId === pendingDevice.id).length
    : 0;

  return (
    <div className="app-root">
      {appMode === AppMode.BUILD ? (
        <Sidebar
          onAddDevice={handleAddDevice}
          addingLinkState={addingLinkState}
          onToggleAddLink={addLinkHandler}
          showInterfaceIps={showInterfaceIps}
          onToggleInterfaceIps={() => setShowInterfaceIps(v => !v)}
          pingState={pingState}
          onTogglePing={pingHandler}
          onImport={importHandler}
          mode={appMode}
          onSwitchMode={handleSwitchMode}
        />
      ) : (
        <SimulationSidebar
          ref={simSidebarRef}
          devices={devices}
          mode={appMode}
          onSwitchMode={handleSwitchMode}
          pingSourceId={simPingSourceId}
          onStatusChange={handleSimStatusChange}
          speed={simSpeed}
          onSpeedChange={setSimSpeed}
          onSimEvent={handleSimEvent}
          onSimReset={handleSimReset}
        />
      )}

      <main className="app-canvas-area">
        <TopologyCanvas
          ref={canvasRef}
          devices={devices}
          links={links}
          readOnly={appMode === AppMode.SIMULATE}
          pingArmed={simRunning}
          addingLinkState={addingLinkState}
          sourceDeviceId={sourceDevice}
          showInterfaceIps={showInterfaceIps}
          onUpdateDevicePosition={handleUpdateDevicePosition}
          onSelectDevice={appMode === AppMode.SIMULATE ? handleSimDeviceClick : handleSelectDevice}
          onConfigureDevice={handleConfigureDevice}
          onRequestDeleteDevice={requestDeleteDevice}
          onConfigureLink={requestConfigureLink}
          onRequestDeleteLink={requestDeleteLink}
          onPaneClick={appMode === AppMode.SIMULATE ? handleSimPaneClick : undefined}
          pingState={pingState}
          pingSourceId={appMode === AppMode.SIMULATE ? simPingSourceId : pingSource}
          highlightedLinkIds={highlightedLinkIds}
          pingHops={pingResult?.hops || null}
          pingAnimating={pingAnimating}
          onPingAnimationComplete={handlePingAnimationComplete}
          simActive={appMode === AppMode.SIMULATE && (simState === 'running' || simState === 'paused')}
          simSegments={Object.values(simSegments)}
          simSpeed={simSpeed}
          simPaused={simState === 'paused'}
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

      {selectedLink && (
        <EditLinkModal
          sourceName={devices.find(d => d.id === selectedLink.sourceId)?.name}
          destName={devices.find(d => d.id === selectedLink.destId)?.name}
          bandwidth={selectedLink.bandwidth}
          unit={selectedLink.bandwidthUnit}
          delay={selectedLink.delay}
          weight={selectedLink.weight}
          onSave={(updatedData) => handleSaveLinkConfig(selectedLink.id, updatedData)}
          onDelete={() => requestDeleteLink(selectedLink.id)}
          onClose={handleCloseLinkConfig}
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

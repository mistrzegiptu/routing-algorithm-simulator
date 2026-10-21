import { useState, useCallback, useRef } from 'react';
import { useTopology } from './hooks/useTopology.js';
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
import SimulationSummaryModal from "./modals/SimulationSummaryModal.jsx";
import "./App.css";
import { useSimulationState } from './hooks/useSimulationState.js';
import { useBuildTools } from './hooks/useBuildTools.js';

function App() {
  const [appMode, setAppMode] = useState(AppMode.BUILD);
  // Holds the stats snapshot passed to SimulationSummaryModal after a run ends.
  const [simSummaryData, setSimSummaryData] = useState(null);
  const [showInterfaceIps, setShowInterfaceIps] = useState(true);
  const [simPingArmed, setSimPingArmed] = useState(false);

  const canvasRef = useRef(null);

  const {
    devices,
    links,
    importHandler,
    handleUpdateDevicePosition,
    removeDevice,
    saveNewLink,
    handleSaveLinkConfig,
    removeLink,
    saveDeviceConfig,
    handleAddDevice
  } = useTopology(canvasRef);

  const {
    simSidebarRef,
    simRunning,
    setSimRunning,
    simPingSourceId,
    simState,
    simSpeed,
    setSimSpeed,
    simSegments,
    handleSimEvent,
    handleSimReset,
    handleSimStatusChange,
    handleSimDeviceClick,
    handleSimPaneClick,
    setSimPingSourceId
  } = useSimulationState(links)

  const {
    selectedDeviceId,
    setSelectedDeviceId,
    devicePendingDeletion,
    selectedLinkId,
    setSelectedLinkId,
    addingLinkState,
    sourceDevice,
    pingState,
    pingSource,
    pingResult,
    pingAnimating,
    highlightedLinkIds,
    setHighlightedLinkIds,
    resetPing,
    resetLinkSelection,
    addLinkHandler,
    pingHandler,
    handleSelectDevice,
    handleConfigureDevice,
    handleCloseConfig,
    requestConfigureLink,
    handleCloseLinkConfig,
    handlePingAnimationComplete,
    handlePingReplay,
    requestDeleteDevice,
    cancelDeleteDevice,
    confirmDeleteDevice
  } = useBuildTools(removeDevice, saveNewLink, simPingArmed)

  // --- Link deletion (fast, no confirmation — a link is cheap to recreate) ---
  const requestDeleteLink = useCallback(async (id) => {
    try {
      await removeLink(id);
      setHighlightedLinkIds(prev => prev.filter(lid => lid !== id));
      setSelectedLinkId(prev => (prev === id ? null : prev));
    } catch (error) {
      console.error("Error deleting link:", error);
    }
  }, []);

  // --- Screen mode (Buduj / Symuluj) ---
  const handleSwitchMode = (mode) => {
    if (mode === appMode) return;
    if (mode === AppMode.SIMULATE) {
      // Leave build-time tools/panels behind; the simulation canvas is read-only.
      resetPing();
      resetLinkSelection();
      setSelectedDeviceId(null);
      setSelectedLinkId(null);
      cancelDeleteDevice();
    } else {
      // Leaving Symuluj unmounts its sidebar, which closes the socket and
      // ends the simulation world on the backend.
      setSimRunning(false);
      setSimPingArmed(false);
      setSimPingSourceId(null);
    }
    setAppMode(mode);
  };

  // Called by SimulationSidebar when a simulation ends; receives topology
  // context, finished metadata, and up-to-date stats snapshot.
  const handleSimFinished = useCallback((data) => {
    setSimSummaryData(data);
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
    }
  }, [links]);

  const handleSimDeviceSelection = (id) => {
    if (!simRunning) return;
    handleSimDeviceClick(id);
  };

  const handleSimulationStatusChange = (state) => {
    handleSimStatusChange(state);

    if (state !== 'running' && state !== 'paused') {
      setSimPingArmed(false);
    }
  };

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
          links={links}
          mode={appMode}
          onSwitchMode={handleSwitchMode}
          pingSourceId={simPingSourceId}
          simPingArmed={simPingArmed}
          onToggleSimPing={() => {
            setSimPingArmed(v => !v);
            setSimPingSourceId(null);
          }}
          onStatusChange={handleSimulationStatusChange}
          speed={simSpeed}
          onSpeedChange={setSimSpeed}
          onSimEvent={handleSimEvent}
          onSimReset={handleSimReset}
          onSimFinished={handleSimFinished}
        />
      )}

      <main className="app-canvas-area">
        <TopologyCanvas
          ref={canvasRef}
          devices={devices}
          links={links}
          readOnly={appMode === AppMode.SIMULATE}
          pingArmed={simPingArmed}
          addingLinkState={addingLinkState}
          sourceDeviceId={sourceDevice}
          showInterfaceIps={showInterfaceIps}
          onUpdateDevicePosition={handleUpdateDevicePosition}
          onSelectDevice={appMode === AppMode.SIMULATE ? handleSimDeviceSelection : handleSelectDevice}
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

      {/* Device details side panel (BUILD mode) */}
      {selectedDeviceId !== null && (
        <DeviceDetailsPanel
          device={selectedDevice}
          onClose={handleCloseConfig}
          onSave={saveDeviceConfig}
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
          onSave={async (updatedData) => {
            try {
              await handleSaveLinkConfig(selectedLink.id, updatedData);
              handleCloseLinkConfig();
            } catch (error) {
              console.error("Error saving link:", error);
            }
          }}
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

      {simSummaryData && (
        <SimulationSummaryModal
          data={simSummaryData}
          onClose={() => setSimSummaryData(null)}
        />
      )}
    </div>
  );
}

export default App;

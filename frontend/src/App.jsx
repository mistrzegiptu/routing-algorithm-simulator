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
import SimPanelToggles from "./components/SimPanelToggles.jsx";
import SimulationLogPanel from "./components/SimulationLogPanel.jsx";
import SimulationStatsPanel from "./components/SimulationStatsPanel.jsx";
import SimulationEditPanel from "./components/SimulationEditPanel.jsx";
import "./App.css";
import { useSimulationState } from './hooks/useSimulationState.js';
import { useBuildTools } from './hooks/useBuildTools.js';

function App() {
  const [appMode, setAppMode] = useState(AppMode.BUILD);
  // Holds the stats snapshot passed to SimulationSummaryModal after a run ends.
  const [simSummaryData, setSimSummaryData] = useState(null);
  const [showInterfaceIps, setShowInterfaceIps] = useState(true);
  const [simPingArmed, setSimPingArmed] = useState(false);
  const [simPanel, setSimPanel] = useState(null);
  const [simSidebarCollapsed, setSimSidebarCollapsed] = useState(false);
  const [simAlgorithmLabel, setSimAlgorithmLabel] = useState("");

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
    simLog,
    simTables,
    simEventCount,
    statsSnap,
    derived,
    recordPingSent,
    getLatestStats,
    handleSimEvent,
    handleSimReset,
    handleSimStatusChange,
    handleSimDeviceClick,
    handleSimPaneClick,
    setSimPingSourceId
  } = useSimulationState(devices, links)

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
  }, [removeLink, setHighlightedLinkIds, setSelectedLinkId]);

  // --- Screen mode (Buduj / Symuluj) ---
  const handleSwitchMode = (mode) => {
    if (mode === appMode) return;
    resetLinkSelection();
    if (mode === AppMode.SIMULATE) {
      // Leave build-time tools/panels behind.
      resetPing();
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

  const avgLinkDelay = links.length > 0
    ? links.reduce((sum, l) => sum + (l.delay || 0), 0) / links.length
    : 0;

  // Called by SimulationSidebar when a simulation ends.
  const handleSimFinished = (finished) => {
    setSimSummaryData({
      finished,
      algorithm: simAlgorithmLabel,
      deviceCount: devices.length,
      linkCount: links.length,
      avgLinkDelay,
      ...getLatestStats(),
    });
  };

  const handleSimDeviceSelection = useCallback((id) => {
    if (addingLinkState !== AddingLinkState.NORMAL) {
      handleSelectDevice(id);
      return;
    }
    if (!simRunning) return;
    handleSimDeviceClick(id);
  }, [addingLinkState, handleSelectDevice, simRunning, handleSimDeviceClick]);

  const handleToggleSimPing = () => {
    resetLinkSelection();
    setSimPingArmed(v => !v);
    setSimPingSourceId(null);
  };

  const handleToggleSimAddLink = useCallback(() => {
    setSimPingArmed(false);
    setSimPingSourceId(null);
    addLinkHandler();
  }, [addLinkHandler, setSimPingSourceId]);

  const handleToggleSimPanel = useCallback((panel) => {
    const next = simPanel === panel ? null : panel;
    if (simPanel === 'edit' && next !== 'edit') resetLinkSelection();
    setSimPanel(next);
  }, [simPanel, resetLinkSelection]);

  const closeSimPanel = useCallback(() => {
    if (simPanel === 'edit') resetLinkSelection();
    setSimPanel(null);
  }, [simPanel, resetLinkSelection]);

  const handleConfirmDeleteDevice = async () => {
    const id = devicePendingDeletion;
    await confirmDeleteDevice();
    if (simPingSourceId === id) setSimPingSourceId(null);
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
          mode={appMode}
          onSwitchMode={handleSwitchMode}
          pingSourceId={simPingSourceId}
          simPingArmed={simPingArmed}
          onToggleSimPing={handleToggleSimPing}
          onStatusChange={handleSimulationStatusChange}
          speed={simSpeed}
          onSpeedChange={setSimSpeed}
          onAlgorithmChange={setSimAlgorithmLabel}
          onSimEvent={handleSimEvent}
          onSimReset={handleSimReset}
          onSimFinished={handleSimFinished}
          onPingSent={recordPingSent}
          eventCount={simEventCount}
          collapsed={simSidebarCollapsed}
          onToggleCollapsed={() => setSimSidebarCollapsed(v => !v)}
        />
      )}

      <main className="app-canvas-area">
        <TopologyCanvas
          ref={canvasRef}
          devices={devices}
          links={links}
          simMode={appMode === AppMode.SIMULATE}
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
          simSegments={simSegments}
          simSpeed={simSpeed}
          simPaused={simState === 'paused'}
        />
        {appMode === AppMode.SIMULATE && (
          <SimPanelToggles active={simPanel} onToggle={handleToggleSimPanel} />
        )}
      </main>

      {selectedDeviceId !== null && (
        <DeviceDetailsPanel
          device={selectedDevice}
          onClose={handleCloseConfig}
          onSave={saveDeviceConfig}
          onDelete={requestDeleteDevice}
          showSimTable={appMode === AppMode.SIMULATE}
          simTable={simTables[selectedDeviceId] ?? null}
        />
      )}

      {appMode === AppMode.SIMULATE && simPanel === 'logs' && (
        <SimulationLogPanel blocks={simLog} onClose={closeSimPanel} />
      )}

      {appMode === AppMode.SIMULATE && simPanel === 'stats' && (
        <SimulationStatsPanel
          onClose={closeSimPanel}
          statsSnap={statsSnap}
          derived={derived}
          algorithm={simAlgorithmLabel}
          deviceCount={devices.length}
          linkCount={links.length}
          avgLinkDelay={avgLinkDelay}
        />
      )}

      {appMode === AppMode.SIMULATE && simPanel === 'edit' && (
        <SimulationEditPanel
          onAddDevice={handleAddDevice}
          addingLinkState={addingLinkState}
          onToggleAddLink={handleToggleSimAddLink}
          onClose={closeSimPanel}
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
          onConfirm={handleConfirmDeleteDevice}
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

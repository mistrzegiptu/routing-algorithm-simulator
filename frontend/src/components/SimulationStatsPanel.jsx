import { memo } from "react";
import SidePanel from "./SidePanel.jsx";
import SimulationStats from "./SimulationStats.jsx";

function SimulationStatsPanel({
  onClose,
  statsSnap,
  derived,
  algorithm,
  deviceCount,
  linkCount,
  avgLinkDelay,
}) {
  return (
    <SidePanel
      title="Statystyki symulacji"
      subtitle={<>Algorytm: <strong>{algorithm}</strong></>}
      onClose={onClose}
    >
      <SimulationStats
        statsSnap={statsSnap}
        derived={derived}
        algorithm={algorithm}
        deviceCount={deviceCount}
        linkCount={linkCount}
        avgLinkDelay={avgLinkDelay}
      />
    </SidePanel>
  );
}

export default memo(SimulationStatsPanel);

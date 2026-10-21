import SidePanel from "./SidePanel.jsx";
import SimulationStats from "./SimulationStats.jsx";

export default function SimulationStatsPanel({
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

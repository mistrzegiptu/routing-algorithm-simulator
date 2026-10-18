import SimulationStats from "./SimulationStats.jsx";
import "./SimulationStatsPanel.css";

/**
 * SimulationStatsPanel — side panel for displaying detailed simulation statistics.
 *
 * Can be toggled open/closed via a button in SimulationSidebar or on the canvas.
 * It docks on the right side of the screen as a slide-over panel, keeping
 * the simulation sidebar clean and avoiding vertical scrolling issues.
 */
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
    <aside className="right-panel sim-stats-panel">
      <header className="sim-stats-panel__header">
        <div className="sim-stats-panel__title-group">
          <h2 className="sim-stats-panel__title">
            Statystyki symulacji
          </h2>
          <span className="sim-stats-panel__subtitle">
            Algorytm: <strong>{algorithm}</strong>
          </span>
        </div>
        <button
          className="sim-stats-panel__close-btn"
          onClick={onClose}
          title="Zamknij panel statystyk"
        >
          ✕
        </button>
      </header>

      <div className="sim-stats-panel__content">
        <SimulationStats
          statsSnap={statsSnap}
          derived={derived}
          algorithm={algorithm}
          deviceCount={deviceCount}
          linkCount={linkCount}
          avgLinkDelay={avgLinkDelay}
        />
      </div>
    </aside>
  );
}

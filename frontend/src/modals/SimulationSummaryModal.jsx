import SimulationStats from "../components/SimulationStats.jsx";
import "./SimulationSummaryModal.css";

const FINISH_REASONS = {
  stopped: "zatrzymana ręcznie",
  max_events: "limit zdarzeń bezpieczeństwa",
};

/**
 * SimulationSummaryModal — shown when a simulation finishes.
 *
 * Props:
 *   data        — { statsSnap, derived, finished, algorithm, deviceCount,
 *                   linkCount, avgLinkDelay }
 *   onClose()   — called when the user dismisses the modal
 */
export default function SimulationSummaryModal({ data, onClose }) {
  if (!data) return null;

  const {
    statsSnap,
    derived,
    finished,
    algorithm,
    deviceCount,
    linkCount,
    avgLinkDelay,
  } = data;

  const reason = FINISH_REASONS[finished?.reason] ?? finished?.reason ?? "nieznana";
  const simTime = finished?.sim_time != null
    ? `${Math.round(finished.sim_time).toLocaleString()} ms`
    : "—";

  return (
    <div className="sim-summary-backdrop" onClick={onClose}>
      <div className="sim-summary" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="sim-summary__header">
          <div>
            <div className="sim-summary__title">
              Podsumowanie symulacji
            </div>
            <div className="sim-summary__meta">
              <div className="sim-summary__meta-row">
                Przyczyna zakończenia: <strong>{reason}</strong>
              </div>
              <div className="sim-summary__meta-row">
                Czas symulacji: <strong>{simTime}</strong>
              </div>
            </div>
          </div>
          <button className="sim-summary__close" onClick={onClose} title="Zamknij">
            ✕
          </button>
        </div>

        {/* ── Body — reuse the same stats component as the sidebar ── */}
        <div className="sim-summary__body">
          <SimulationStats
            statsSnap={statsSnap}
            derived={derived}
            algorithm={algorithm}
            deviceCount={deviceCount}
            linkCount={linkCount}
            avgLinkDelay={avgLinkDelay}
          />
        </div>

        {/* ── Footer ── */}
        <div className="sim-summary__footer">
          <button className="sim-summary__btn" onClick={onClose}>
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

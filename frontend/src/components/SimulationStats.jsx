import "./SimulationStats.css";

/**
 * SimulationStats — pure presentation component.
 *
 * Receives pre-computed stats from the useSimStats hook (via SimulationSidebar
 * or SimulationSummaryModal) and renders them in three labelled groups.
 *
 * Props:
 *   statsSnap    — raw counters snapshot from useSimStats
 *   derived      — { packetLoss, avgRtt, minRtt, maxRtt }
 *   algorithm    — display name of the active algorithm
 *   deviceCount  — number of devices in the topology
 *   linkCount    — number of links in the topology
 *   avgLinkDelay — average link delay in ms
 */
export default function SimulationStats({
  statsSnap = {},
  derived = {},
  algorithm = "—",
  deviceCount = 0,
  linkCount = 0,
  avgLinkDelay = 0,
}) {
  const snap = statsSnap || {};
  const der = derived || {};
  const hasRtt = snap.rttByPing && snap.rttByPing.size > 0;
  const safeAvgDelay = typeof avgLinkDelay === "number" ? avgLinkDelay.toFixed(1) : "0.0";

  return (
    <>
      {/* ── Topology group ── */}
      <div className="sim-stats__group">
        <div className="sim-stats__group-title">Topologia</div>
        <div className="sim-stats__row">
          <span className="sim-stats__label">Algorytm</span>
          <span className="sim-stats__value">{algorithm}</span>
        </div>
        <div className="sim-stats__row">
          <span className="sim-stats__label">Urządzenia</span>
          <span className="sim-stats__value">{deviceCount}</span>
        </div>
        <div className="sim-stats__row">
          <span className="sim-stats__label">Łącza</span>
          <span className="sim-stats__value">{linkCount}</span>
        </div>
        <div className="sim-stats__row">
          <span className="sim-stats__label">Śr. opóźn. łącza</span>
          <span className="sim-stats__value">
            {safeAvgDelay}{" "}
            <span className="sim-stats__unit">ms</span>
          </span>
        </div>
      </div>

      {/* ── Ping group ── */}
      <div className="sim-stats__group">
        <div className="sim-stats__group-title">Pingi (operacje)</div>
        <div className="sim-stats__row">
          <span className="sim-stats__label">Wysłane</span>
          <span className="sim-stats__value">{snap.pingsInitiated ?? 0}</span>
        </div>
        <div className="sim-stats__row">
          <span className="sim-stats__label">Ukończone</span>
          <span
            className={`sim-stats__value ${
              (snap.pingsCompleted ?? 0) > 0 ? "sim-stats__value--good" : ""
            }`}
          >
            {snap.pingsCompleted ?? 0}
          </span>
        </div>
        <div className="sim-stats__row">
          <span className="sim-stats__label">Współczynnik sukcesu</span>
          <span
            className={`sim-stats__value ${
              der.pingSuccessRate === 100
                ? "sim-stats__value--good"
                : (der.pingSuccessRate ?? 0) > 0
                ? "sim-stats__value--accent"
                : ""
            }`}
          >
            {(der.pingSuccessRate != null ? der.pingSuccessRate : 0).toFixed(1)}{" "}
            <span className="sim-stats__unit">%</span>
          </span>
        </div>
        {hasRtt && (
          <>
            <div className="sim-stats__row">
              <span className="sim-stats__label">Średni RTT</span>
              <span className="sim-stats__value sim-stats__value--accent">
                {(der.avgRtt != null ? der.avgRtt : 0).toFixed(1)}{" "}
                <span className="sim-stats__unit">ms</span>
              </span>
            </div>
            <div className="sim-stats__row">
              <span className="sim-stats__label">Min / Max RTT</span>
              <span className="sim-stats__value">
                {(der.minRtt != null ? der.minRtt : 0).toFixed(1)} / {(der.maxRtt != null ? der.maxRtt : 0).toFixed(1)}{" "}
                <span className="sim-stats__unit">ms</span>
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Network traffic group ── */}
      <div className="sim-stats__group">
        <div className="sim-stats__group-title">Ruch sieciowy (pakiety)</div>
        <div className="sim-stats__row">
          <span className="sim-stats__label">Pakiety wysłane</span>
          <span className="sim-stats__value">{snap.packetsSent ?? 0}</span>
        </div>
        <div className="sim-stats__row">
          <span className="sim-stats__label">Pakiety dostarczone</span>
          <span className="sim-stats__value sim-stats__value--good">
            {snap.packetsDelivered ?? 0}
          </span>
        </div>
        <div className="sim-stats__row">
          <span className="sim-stats__label">Pakiety odrzucone</span>
          <span
            className={`sim-stats__value ${
              (snap.packetsDropped ?? 0) > 0 ? "sim-stats__value--bad" : ""
            }`}
          >
            {snap.packetsDropped ?? 0}
          </span>
        </div>
        {(snap.packetsDelivered ?? 0) + (snap.packetsDropped ?? 0) > 0 && (
          <div className="sim-stats__row">
            <span className="sim-stats__label">Współczynnik sukcesu</span>
            <span
              className={`sim-stats__value ${
                (der.packetDeliveryRate ?? 0) > 80
                  ? "sim-stats__value--good"
                  : (der.packetDeliveryRate ?? 0) > 30
                  ? "sim-stats__value--accent"
                  : ""
              }`}
            >
              {(der.packetDeliveryRate != null ? der.packetDeliveryRate : 0).toFixed(1)}{" "}
              <span className="sim-stats__unit">%</span>
            </span>
          </div>
        )}
        <div className="sim-stats__row">
          <span className="sim-stats__label">Pakiety kontrolne</span>
          <span className="sim-stats__value">{snap.controlPackets ?? 0}</span>
        </div>
        {(snap.maxHops ?? 0) > 0 && (
          <div className="sim-stats__row">
            <span className="sim-stats__label">Najdłuższa ścieżka</span>
            <span className="sim-stats__value">
              {snap.maxHops}{" "}
              <span className="sim-stats__unit">hops</span>
            </span>
          </div>
        )}
      </div>

      {/* ── Routing group ── */}
      <div className="sim-stats__group">
        <div className="sim-stats__group-title">Routing</div>
        <div className="sim-stats__row">
          <span className="sim-stats__label">Aktualizacje tablic</span>
          <span className="sim-stats__value">{snap.tableUpdates ?? 0}</span>
        </div>
        {snap.lastTableUpdateTime != null && (
          <div className="sim-stats__row">
            <span className="sim-stats__label">Czas konwergencji ≈</span>
            <span className="sim-stats__value">
              {Math.round(snap.lastTableUpdateTime)}{" "}
              <span className="sim-stats__unit">ms</span>
            </span>
          </div>
        )}
      </div>
    </>
  );
}

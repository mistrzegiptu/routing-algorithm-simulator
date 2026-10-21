import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ModeSwitch from "./ModeSwitch.jsx";
import { fetchAlgorithms, SimulationSocket } from "../api/simulation_api.js";
import { useSimStats } from "./useSimStats.js";
import SimulationStatsPanel from "./SimulationStatsPanel.jsx";
import "./Sidebar.css";

const STATUS_LABELS = {
  idle: "Bezczynna",
  running: "W toku",
  paused: "Pauza",
  finished: "Zakończona",
  error: "Błąd",
};

const FINISH_REASONS = {
  stopped: "zatrzymana",
  max_events: "limit zdarzeń bezpieczeństwa",
};

const SPEED_MIN_EXP = -2;
const SPEED_MAX_EXP = 1;

function sliderToSpeed(value) {
  const speed = 10 ** value;
  return speed >= 1 ? Math.round(speed * 10) / 10 : Math.round(speed * 100) / 100;
}

function formatSimTime(t) {
  return t < 1000 ? `${Math.round(t)} ms` : `${(t / 1000).toFixed(2).replace(".", ",")} s`;
}

function defaultOptions(algo) {
  return Object.fromEntries((algo?.options ?? []).map((option) => [option.key, option.default]));
}

// Compact Polish one-liners for the mini-log; packet_recv is skipped as noise.
function formatEvent(ev, nameOf) {
  const t = formatSimTime(ev.t);
  const p = ev.payload || {};
  switch (ev.type) {
    case "packet_sent":
      return {
        text: `[${t}] ${nameOf(ev.from_id)} → ${nameOf(ev.to_id)} (${ev.protocol}${p.summary ? ` · ${p.summary}` : ""})`,
      };
    case "packet_delivered":
      if (p.icmp === "reply") {
        return {
          text: `[${t}] ✓ Odpowiedź wróciła do ${nameOf(ev.node_id)} — RTT ${Math.round(p.rtt)} ms`,
          tone: "good",
        };
      }
      if (p.icmp === "request") {
        return {
          text: `[${t}] ✓ Ping dotarł do ${nameOf(ev.node_id)} (${Math.round(p.elapsed)} ms)`,
          tone: "good",
        };
      }
      return { text: `[${t}] ✓ Dostarczono do ${nameOf(ev.node_id)}`, tone: "good" };
    case "packet_dropped":
      if (p.reason === "link_disconnected") {
        return {
          text: `[${t}] ✗ Pakiet porzucono na łączu ${nameOf(ev.from_id)} → ${nameOf(ev.to_id)} (łącze usunięte)`,
          tone: "bad",
        };
      }
      return { text: `[${t}] ✗ Porzucono w ${nameOf(ev.node_id)} (${p.reason ?? "?"})`, tone: "bad" };
    case "table_update":
      return { text: `[${t}] Tablica routingu: ${nameOf(ev.node_id)}` };
    case "node_log":
      return { text: `[${t}] ${nameOf(ev.node_id)}: ${p.message ?? ""}` };
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const SimulationSidebar = forwardRef(function SimulationSidebar(
  {
    devices,
    links,
    mode,
    onSwitchMode,
    pingSourceId,
    simPingArmed,
    onToggleSimPing,
    onStatusChange,
    speed,
    onSpeedChange,
    onSimEvent,
    onSimReset,
    onSimFinished,
  },
  ref
) {
  const [algorithms, setAlgorithms] = useState([]);
  const [algorithm, setAlgorithm] = useState("");
  const [optionValues, setOptionValues] = useState({});
  const [skipIdle, setSkipIdle] = useState(true);

  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState(null);
  const [finished, setFinished] = useState(null);
  const [eventCount, setEventCount] = useState(0);
  const [logLines, setLogLines] = useState([]);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [portalTarget, setPortalTarget] = useState(null);

  useEffect(() => {
    setPortalTarget(document.querySelector(".app-root") || document.body);
  }, []);

  // Stats managed by the dedicated hook.
  const { statsSnap, derived, accumulateStats, recordPingSent, resetStats, getLatestStats } = useSimStats(status);

  const socketRef = useRef(null);
  const logRef = useRef(null);

  // Socket callbacks are created once — read live values through refs.
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const onSimEventRef = useRef(onSimEvent);
  onSimEventRef.current = onSimEvent;
  const onSimFinishedRef = useRef(onSimFinished);
  onSimFinishedRef.current = onSimFinished;

  // Keep derived props that summary modal needs accessible inside closures.
  const linksRef = useRef(links);
  linksRef.current = links;
  const algorithmRef = useRef(algorithm);
  algorithmRef.current = algorithm;
  const algorithmsRef = useRef(algorithms);
  algorithmsRef.current = algorithms;
  const getLatestStatsRef = useRef(getLatestStats);
  getLatestStatsRef.current = getLatestStats;

  useEffect(() => {
    fetchAlgorithms()
      .then((list) => {
        setAlgorithms(list);
        if (list.length > 0) setAlgorithm(list[0].name);
      })
      .catch(() => setErrorMsg("Nie udało się pobrać listy algorytmów"));

    return () => socketRef.current?.close();
  }, []);

  // Keep the newest log line in view.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logLines]);

  const nameOf = (id) =>
    devicesRef.current.find((d) => d.id === id)?.name ??
    (id === null || id === undefined ? "?" : `#${id}`);

  const applyStatus = (state) => {
    setStatus(state);
    onStatusChangeRef.current?.(state);
  };

  const ensureSocket = async () => {
    if (socketRef.current?.isOpen) return socketRef.current;
    const socket = new SimulationSocket({
      onEvent: (ev) => {
        setEventCount((n) => n + 1);
        accumulateStats(ev);
        onSimEventRef.current?.(ev);
        const line = formatEvent(ev, nameOf);
        if (line) setLogLines((prev) => [...prev.slice(-99), line]);
      },
      onStatus: (msg) => applyStatus(msg.state),
      onFinished: (msg) => {
        setFinished(msg);
        // Fire the summary callback — snap the current stats from the ref so
        // it includes events processed right up to the finish message.
        const currentLinks = linksRef.current;
        const avgLinkDelay =
          currentLinks.length > 0
            ? currentLinks.reduce((sum, l) => sum + (l.delay || 0), 0) / currentLinks.length
            : 0;
        const algoName =
          algorithmsRef.current.find((a) => a.name === algorithmRef.current)?.display_name ??
          algorithmRef.current;
        const latest = getLatestStatsRef.current();
        onSimFinishedRef.current?.({
          finished: msg,
          algorithm: algoName,
          deviceCount: devicesRef.current.length,
          linkCount: currentLinks.length,
          avgLinkDelay,
          statsSnap: latest.statsSnap,
          derived: latest.derived,
        });
      },
      onError: (message) => setErrorMsg(message),
      onPingSent: () => recordPingSent(),
      onClose: () => applyStatus("idle"),
    });
    await socket.connect();
    socketRef.current = socket;
    return socket;
  };

  // The canvas (via App) sends pings into the running world through this handle.
  useImperativeHandle(ref, () => ({
    sendPing: (sourceId, targetId) => socketRef.current?.ping(sourceId, targetId),
    getLatestStats: () => getLatestStats(),
  }), [getLatestStats]);


  const selectedAlgo = algorithms.find((a) => a.name === algorithm);
  const currentOptions = { ...defaultOptions(selectedAlgo), ...(optionValues[algorithm] ?? {}) };

  const handleOptionChange = (key, value) => {
    setOptionValues((prev) => ({ ...prev, [algorithm]: { ...(prev[algorithm] ?? {}), [key]: value } }));
  };

  const handleStart = async () => {
    setErrorMsg(null);
    setFinished(null);
    setEventCount(0);
    setLogLines([]);
    resetStats();
    onSimReset?.();
    try {
      const socket = await ensureSocket();
      socket.start({ algorithm, speed, options: currentOptions, skipIdle });
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handlePauseResume = () => {
    const socket = socketRef.current;
    if (!socket?.isOpen) return;
    if (status === "running") socket.pause();
    else if (status === "paused") socket.resume();
  };

  const handleSpeedChange = (value) => {
    onSpeedChange?.(value);
    if (socketRef.current?.isOpen) socketRef.current.setSpeed(value);
  };

  const handleSkipIdleChange = (value) => {
    setSkipIdle(value);
    if (socketRef.current?.isOpen) socketRef.current.setSkipIdle(value);
  };

  const running = status === "running" || status === "paused";

  const pingHint = !running || !simPingArmed
    ? null
    : pingSourceId === null || pingSourceId === undefined
      ? "Kliknij urządzenie źródłowe na kanwie"
      : `Źródło: ${nameOf(pingSourceId)} — kliknij cel pingu`;

  // ── Derived stats for rendering ──
  const avgLinkDelay =
    links.length > 0
      ? links.reduce((sum, l) => sum + (l.delay || 0), 0) / links.length
      : 0;

  return (
    <aside className="sidebar sidebar--sim">
      <header className="sidebar__brand">
        <span className="sidebar__logo">◈</span>
        <div>
          <div className="sidebar__title">Routing Simulator</div>
          <div className="sidebar__subtitle">Symulacja routingu</div>
        </div>
      </header>

      <ModeSwitch mode={mode} onSwitchMode={onSwitchMode} />

      <div className="sidebar__scroll">
        <section className="sidebar__section">
          <h2 className="sidebar__heading">Algorytm</h2>
          <select
            className="sim-select"
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
            disabled={running}
          >
            {algorithms.length === 0 && <option value="">— brak algorytmów —</option>}
            {algorithms.map((a) => (
              <option key={a.name} value={a.name}>{a.display_name}</option>
            ))}
          </select>
          {selectedAlgo?.description && (
            <p className="sim-note">{selectedAlgo.description}</p>
          )}
          {selectedAlgo?.options?.length > 0 && (
            <div className="sim-options">
              {selectedAlgo.options.map((option) => option.type === "bool" ? (
                <label key={option.key} className="sim-option sim-option--toggle" title={option.description}>
                  <input
                    type="checkbox"
                    checked={Boolean(currentOptions[option.key])}
                    disabled={running}
                    onChange={(e) => handleOptionChange(option.key, e.target.checked)}
                  />
                  <span>{option.label}</span>
                </label>
              ) : (
                <label key={option.key} className="sim-option" title={option.description}>
                  <span className="sim-field-label">{option.label}</span>
                  <select
                    className="sim-select"
                    value={currentOptions[option.key]}
                    disabled={running}
                    onChange={(e) => handleOptionChange(option.key, e.target.value)}
                  >
                    {option.choices.map((choice) => (
                      <option key={choice.value} value={choice.value}>{choice.label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="sidebar__section">
          <h2 className="sidebar__heading">Sterowanie</h2>
          <div className="sim-speed">
            <div className="sim-speed__row">
              <span>Prędkość</span>
              <span>{speed}×</span>
            </div>
            <input
              type="range"
              min={SPEED_MIN_EXP}
              max={SPEED_MAX_EXP}
              step="0.01"
              value={Math.log10(speed)}
              onChange={(e) => handleSpeedChange(sliderToSpeed(Number(e.target.value)))}
            />
          </div>
          <label
            className="sim-option sim-option--toggle"
            title="Gdy żaden pakiet nie jest w drodze, czas symulacji przeskakuje do następnego zdarzenia, np. kolejnej aktualizacji RIP."
          >
            <input
              type="checkbox"
              checked={skipIdle}
              onChange={(e) => handleSkipIdleChange(e.target.checked)}
            />
            <span>Przewijaj czas bez ruchu</span>
          </label>
          {!running ? (
            <button
              className="sidebar__link-btn"
              onClick={handleStart}
              disabled={!algorithm}
            >
              ▶ Uruchom symulację
            </button>
          ) : (
            <div className="sim-controls">
              <button onClick={handlePauseResume}>
                {status === "paused" ? "Wznów" : "Pauza"}
              </button>
              <button onClick={() => socketRef.current?.step()} disabled={status !== "paused"}>
                Krok
              </button>
              <button onClick={() => socketRef.current?.stop()}>
                Stop
              </button>
            </div>
          )}
        </section>

        <section className="sidebar__section">
          <h2 className="sidebar__heading">Ping</h2>
          <button
            className={`sidebar__link-btn sim-ping-toggle${simPingArmed ? " sim-ping-toggle--armed" : ""}`}
            onClick={onToggleSimPing}
            disabled={!running}
            title={running ? (simPingArmed ? "Kliknij, aby wyłączyć tryb pingowania" : "Kliknij, aby włączyć tryb pingowania") : "Uruchom symulację, aby pingować"}
          >
            {simPingArmed ? "Wyłącz tryb pingowania" : "Włącz tryb pingowania"}
          </button>
          {pingHint && <p className="sidebar__hint">{pingHint}</p>}
          {!running && (
            <p className="sim-note">
              Uruchom symulację, a następnie włącz tryb pingowania,
              aby wysłać pakiety między urządzeniami.
            </p>
          )}
        </section>

        <section className="sidebar__section">
          <h2 className="sidebar__heading">Przebieg</h2>
          <div className="sim-status">
            <span>Status: <strong>{STATUS_LABELS[status] ?? status}</strong></span>
            <span>{eventCount} zdarzeń</span>
          </div>
          {errorMsg && <p className="sim-error">{errorMsg}</p>}
          {finished && (
            <p className="sidebar__hint">
              Symulacja {FINISH_REASONS[finished.reason] ?? finished.reason} po{" "}
              {formatSimTime(finished.sim_time)} czasu symulacji
            </p>
          )}
          <div className="sim-log" ref={logRef}>
            {logLines.length === 0 && (
              <span className="sim-log__empty">Zdarzenia symulacji pojawią się tutaj…</span>
            )}
            {logLines.map((line, i) => (
              <span key={i} className={`sim-log__line ${line.tone ? `sim-log__line--${line.tone}` : ""}`}>
                {line.text}
              </span>
            ))}
          </div>
          <div className="sim-legend">
            <span className="sim-legend__item">
              <span className="sim-legend__dot" style={{ background: "#38bdf8" }} />
              Ping (żądanie)
            </span>
            <span className="sim-legend__item">
              <span className="sim-legend__dot" style={{ background: "#34d399" }} />
              Odpowiedź
            </span>
            <span className="sim-legend__item">
              <span className="sim-legend__dot" style={{ background: "#f0a23b" }} />
              Pakiet kontrolny
            </span>
          </div>
        </section>

        {/* ── Statistics side panel toggle button ── */}
        <section className="sidebar__section">
          <button
            className={`sidebar__link-btn ${showStatsPanel ? "is-active" : ""}`}
            onClick={() => setShowStatsPanel((v) => !v)}
            type="button"
          >
            {showStatsPanel ? "Ukryj statystyki" : "Statystyki"}
          </button>
        </section>
      </div>

      {showStatsPanel &&
        portalTarget &&
        createPortal(
          <SimulationStatsPanel
            onClose={() => setShowStatsPanel(false)}
            statsSnap={statsSnap}
            derived={derived}
            algorithm={selectedAlgo?.display_name ?? algorithm}
            deviceCount={devices.length}
            linkCount={links.length}
            avgLinkDelay={avgLinkDelay}
          />,
          portalTarget
        )}
    </aside>
  );
});

export default SimulationSidebar;

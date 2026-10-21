import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import ModeSwitch from "./ModeSwitch.jsx";
import { fetchAlgorithms, SimulationSocket } from "../api/simulation_api.js";
import { formatSimTime } from "../utils/simEvents.js";
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

function defaultOptions(algo) {
  return Object.fromEntries((algo?.options ?? []).map((option) => [option.key, option.default]));
}

// ─────────────────────────────────────────────────────────────────────────────

const SimulationSidebar = forwardRef(function SimulationSidebar(
  {
    devices,
    mode,
    onSwitchMode,
    pingSourceId,
    simPingArmed,
    onToggleSimPing,
    onStatusChange,
    speed,
    onSpeedChange,
    onAlgorithmChange,
    onSimEvent,
    onSimReset,
    onSimFinished,
    onPingSent,
    collapsed,
    onToggleCollapsed,
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

  const socketRef = useRef(null);

  // Socket callbacks are created once — read live props through refs.
  const callbacksRef = useRef({});
  useEffect(() => {
    callbacksRef.current = { onStatusChange, onSimEvent, onSimFinished, onPingSent };
  });

  const selectedAlgo = algorithms.find((a) => a.name === algorithm);
  const algorithmLabel = selectedAlgo?.display_name ?? algorithm;

  useEffect(() => {
    onAlgorithmChange?.(algorithmLabel);
  }, [algorithmLabel, onAlgorithmChange]);

  useEffect(() => {
    fetchAlgorithms()
      .then((list) => {
        setAlgorithms(list);
        if (list.length > 0) setAlgorithm(list[0].name);
      })
      .catch(() => setErrorMsg("Nie udało się pobrać listy algorytmów"));

    return () => socketRef.current?.close();
  }, []);

  const nameOf = (id) =>
    devices.find((d) => d.id === id)?.name ??
    (id === null || id === undefined ? "?" : `#${id}`);

  const applyStatus = (state) => {
    setStatus(state);
    callbacksRef.current.onStatusChange?.(state);
  };

  const ensureSocket = async () => {
    if (socketRef.current?.isOpen) return socketRef.current;
    const socket = new SimulationSocket({
      onEvent: (ev) => {
        setEventCount((n) => n + 1);
        callbacksRef.current.onSimEvent?.(ev);
      },
      onStatus: (msg) => applyStatus(msg.state),
      onFinished: (msg) => {
        setFinished(msg);
        callbacksRef.current.onSimFinished?.(msg);
      },
      onError: (message) => setErrorMsg(message),
      onPingSent: () => callbacksRef.current.onPingSent?.(),
      onClose: () => applyStatus("idle"),
    });
    await socket.connect();
    socketRef.current = socket;
    return socket;
  };

  // The canvas (via App) sends pings into the running world through this handle.
  useImperativeHandle(ref, () => ({
    sendPing: (sourceId, targetId) => socketRef.current?.ping(sourceId, targetId),
  }), []);

  const currentOptions = { ...defaultOptions(selectedAlgo), ...(optionValues[algorithm] ?? {}) };

  const handleOptionChange = (key, value) => {
    setOptionValues((prev) => ({ ...prev, [algorithm]: { ...(prev[algorithm] ?? {}), [key]: value } }));
  };

  const handleStart = async () => {
    setErrorMsg(null);
    setFinished(null);
    setEventCount(0);
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

  return (
    <aside className={`sidebar sidebar--sim${collapsed ? " sidebar--collapsed" : ""}`}>
      <header className="sidebar__brand">
        {!collapsed && (
          <>
            <span className="sidebar__logo">◈</span>
            <div>
              <div className="sidebar__title">Routing Simulator</div>
              <div className="sidebar__subtitle">Symulacja routingu</div>
            </div>
          </>
        )}
        <button
          type="button"
          className="sidebar__collapse-btn"
          onClick={onToggleCollapsed}
          title={collapsed ? "Rozwiń panel" : "Zwiń panel"}
          aria-label={collapsed ? "Rozwiń panel" : "Zwiń panel"}
          aria-expanded={!collapsed}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
          </svg>
        </button>
      </header>

      {!collapsed && (
        <>
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
          </div>
        </>
      )}
    </aside>
  );
});

export default SimulationSidebar;

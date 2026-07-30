import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import ModeSwitch from "./ModeSwitch.jsx";
import { fetchAlgorithms, SimulationSocket } from "../api/simulation_api.js";
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

// Compact Polish one-liners for the mini-log; packet_recv is skipped as noise.
function formatEvent(ev, nameOf) {
  const t = `${Math.round(ev.t)} ms`;
  const p = ev.payload || {};
  switch (ev.type) {
    case "packet_sent":
      return { text: `[${t}] ${nameOf(ev.from_id)} → ${nameOf(ev.to_id)} (${ev.protocol})` };
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
      return { text: `[${t}] ✗ Porzucono w ${nameOf(ev.node_id)} (${p.reason ?? "?"})`, tone: "bad" };
    case "table_update":
      return { text: `[${t}] Tablica routingu: ${nameOf(ev.node_id)}` };
    case "node_log":
      return { text: `[${t}] ${nameOf(ev.node_id)}: ${p.message ?? ""}` };
    default:
      return null;
  }
}

const SimulationSidebar = forwardRef(function SimulationSidebar(
  { devices, mode, onSwitchMode, pingSourceId, onStatusChange, speed, onSpeedChange, onSimEvent, onSimReset },
  ref
) {
  const [algorithms, setAlgorithms] = useState([]);
  const [algorithm, setAlgorithm] = useState("");

  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState(null);
  const [finished, setFinished] = useState(null);
  const [eventCount, setEventCount] = useState(0);
  const [logLines, setLogLines] = useState([]);

  const socketRef = useRef(null);
  const logRef = useRef(null);

  // Socket callbacks are created once — read live values through refs.
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const onSimEventRef = useRef(onSimEvent);
  onSimEventRef.current = onSimEvent;

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
        onSimEventRef.current?.(ev);
        const line = formatEvent(ev, nameOf);
        if (line) setLogLines((prev) => [...prev.slice(-99), line]);
      },
      onStatus: (msg) => applyStatus(msg.state),
      onFinished: (msg) => setFinished(msg),
      onError: (message) => setErrorMsg(message),
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

  const handleStart = async () => {
    setErrorMsg(null);
    setFinished(null);
    setEventCount(0);
    setLogLines([]);
    onSimReset?.();
    try {
      const socket = await ensureSocket();
      socket.start({ algorithm, speed });
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

  const running = status === "running" || status === "paused";
  const selectedAlgo = algorithms.find((a) => a.name === algorithm);

  const pingHint = !running
    ? null
    : pingSourceId === null || pingSourceId === undefined
      ? "Kliknij urządzenie źródłowe na kanwie"
      : `Źródło: ${nameOf(pingSourceId)} — kliknij cel pingu`;

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
              min="0.01"
              max="1"
              step="0.01"
              value={speed}
              onChange={(e) => handleSpeedChange(Number(e.target.value))}
            />
          </div>
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
          {pingHint ? (
            <p className="sidebar__hint">{pingHint}</p>
          ) : (
            <p className="sim-note">
              Uruchom symulację, a następnie kliknij dwa urządzenia na kanwie,
              aby wysłać między nimi ping. Możesz pingować wielokrotnie —
              pakiety wędrują równolegle.
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
              {Math.round(finished.sim_time)} ms czasu symulacji
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
          </div>
        </section>
      </div>
    </aside>
  );
});

export default SimulationSidebar;

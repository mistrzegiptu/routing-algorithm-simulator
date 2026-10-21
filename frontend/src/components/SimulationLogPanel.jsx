import { useEffect, useRef } from "react";
import SidePanel from "./SidePanel.jsx";
import "./SimulationLogPanel.css";

const LEGEND = [
  { color: "#38bdf8", label: "Ping (żądanie)" },
  { color: "#34d399", label: "Odpowiedź" },
  { color: "#f0a23b", label: "Pakiet kontrolny" },
];

export default function SimulationLogPanel({ lines, onClose }) {
  const listRef = useRef(null);
  const followRef = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (el && followRef.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const handleScroll = () => {
    const el = listRef.current;
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  return (
    <SidePanel
      title="Log zdarzeń"
      subtitle={`Ostatnie ${lines.length} wpisów`}
      onClose={onClose}
      className="sim-log-panel"
    >
      <div className="sim-legend">
        {LEGEND.map((item) => (
          <span key={item.label} className="sim-legend__item">
            <span className="sim-legend__dot" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="sim-log" ref={listRef} onScroll={handleScroll}>
        {lines.length === 0 && (
          <span className="sim-log__empty">Zdarzenia symulacji pojawią się tutaj…</span>
        )}
        {lines.map((line) => (
          <span key={line.id} className={`sim-log__line ${line.tone ? `sim-log__line--${line.tone}` : ""}`}>
            {line.text}
          </span>
        ))}
      </div>
    </SidePanel>
  );
}

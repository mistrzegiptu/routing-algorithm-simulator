import { memo, useEffect, useRef } from "react";
import SidePanel from "./SidePanel.jsx";
import "./SimulationLogPanel.css";

const LEGEND = [
  { color: "#38bdf8", label: "Ping (żądanie)" },
  { color: "#34d399", label: "Odpowiedź" },
  { color: "#f0a23b", label: "Pakiet kontrolny" },
];

const LogBlock = memo(function LogBlock({ lines }) {
  return lines.map((line) => (
    <span key={line.id} className={`sim-log__line ${line.tone ? `sim-log__line--${line.tone}` : ""}`}>
      {line.text}
    </span>
  ));
});

function SimulationLogPanel({ blocks, onClose }) {
  const listRef = useRef(null);
  const followRef = useRef(true);
  const count = blocks.reduce((sum, block) => sum + block.length, 0);

  useEffect(() => {
    const el = listRef.current;
    if (el && followRef.current) el.scrollTop = el.scrollHeight;
  }, [blocks]);

  const handleScroll = () => {
    const el = listRef.current;
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  return (
    <SidePanel
      title="Log zdarzeń"
      subtitle={`Ostatnie ${count} wpisów`}
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
        {count === 0 && (
          <span className="sim-log__empty">Zdarzenia symulacji pojawią się tutaj…</span>
        )}
        {blocks.map((block) => <LogBlock key={block[0].id} lines={block} />)}
      </div>
    </SidePanel>
  );
}

export default memo(SimulationLogPanel);

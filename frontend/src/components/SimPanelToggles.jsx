import "./SimPanelToggles.css";

const PANELS = [
  { key: "logs", title: "Log zdarzeń", icon: "M5 7h14M5 12h14M5 17h9" },
  { key: "stats", title: "Statystyki", icon: "M6 19v-7M12 19V5M18 19v-11" },
  { key: "edit", title: "Edycja topologii", icon: "M12 5v14M5 12h14" },
];

export default function SimPanelToggles({ active, onToggle }) {
  return (
    <div className="sim-toggles">
      {PANELS.map((panel) => (
        <button
          key={panel.key}
          type="button"
          className={`sim-toggles__btn ${active === panel.key ? "is-active" : ""}`}
          onClick={() => onToggle(panel.key)}
          title={panel.title}
          aria-label={panel.title}
          aria-pressed={active === panel.key}
        >
          <svg className="sim-toggles__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d={panel.icon} />
          </svg>
        </button>
      ))}
    </div>
  );
}

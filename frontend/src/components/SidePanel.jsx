import { usePanelWidth } from "../hooks/usePanelWidth.js";
import PanelResizer from "./PanelResizer.jsx";
import "./SidePanel.css";

export default function SidePanel({ title, subtitle, onClose, className = "", children }) {
  const { width, handleProps } = usePanelWidth("panel-width:side", 380);

  return (
    <aside className={`side-panel ${className}`} style={{ width }}>
      <PanelResizer {...handleProps} />
      <header className="side-panel__header">
        <div className="side-panel__title-group">
          <h2 className="side-panel__title">{title}</h2>
          {subtitle && <span className="side-panel__subtitle">{subtitle}</span>}
        </div>
        <button
          type="button"
          className="side-panel__close-btn"
          onClick={onClose}
          title="Zamknij"
          aria-label="Zamknij"
        >
          ✕
        </button>
      </header>
      <div className="side-panel__content">{children}</div>
    </aside>
  );
}

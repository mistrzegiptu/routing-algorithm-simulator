import AddItemForm from "../devices/AddItemForm.jsx";
import { AddingLinkState } from "../models/AddingLinkState.js";
import routerImg from "../../images/router.png";
import computerImg from "../../images/computer.png";
import "./Sidebar.css";

export default function Sidebar({
  onAddDevice,
  addingLinkState,
  onToggleAddLink,
  showInterfaceIps,
  onToggleInterfaceIps,
}) {
  const isLinking = addingLinkState !== AddingLinkState.NORMAL;

  const linkHint =
    addingLinkState === AddingLinkState.SELECTING_SOURCE
      ? "Kliknij urządzenie źródłowe"
      : addingLinkState === AddingLinkState.SELECTING_DESTINATION
        ? "Kliknij urządzenie docelowe"
        : null;

  return (
    <aside className="sidebar">
      <header className="sidebar__brand">
        <span className="sidebar__logo">◈</span>
        <div>
          <div className="sidebar__title">Routing Simulator</div>
          <div className="sidebar__subtitle">Topologia sieci</div>
        </div>
      </header>

      <div className="sidebar__scroll">
        <section className="sidebar__section">
          <h2 className="sidebar__heading">Dodaj urządzenie</h2>
          <AddItemForm
            label="Router"
            namePlaceholder="Nazwa routera"
            deviceType="router"
            iconSrc={routerImg}
            accentVar="--router"
            onAdd={onAddDevice}
          />
          <AddItemForm
            label="Komputer"
            namePlaceholder="Nazwa komputera"
            deviceType="computer"
            iconSrc={computerImg}
            accentVar="--computer"
            onAdd={onAddDevice}
          />
        </section>

        <section className="sidebar__section">
          <h2 className="sidebar__heading">Połączenia</h2>
          <button
            className={`sidebar__link-btn ${isLinking ? "is-active" : ""}`}
            onClick={onToggleAddLink}
          >
            {isLinking ? "Anuluj łączenie" : "+ Dodaj połączenie"}
          </button>
          {linkHint && <p className="sidebar__hint">{linkHint}</p>}
        </section>

        <section className="sidebar__section">
          <h2 className="sidebar__heading">Widok</h2>
          <button
            type="button"
            className="sidebar__toggle"
            role="switch"
            aria-checked={showInterfaceIps}
            onClick={onToggleInterfaceIps}
          >
            <span className="sidebar__toggle-label">IP interfejsów</span>
            <span className={`sidebar__switch ${showInterfaceIps ? "is-on" : ""}`}>
              <span className="sidebar__switch-knob" />
            </span>
          </button>
        </section>
      </div>
    </aside>
  );
}

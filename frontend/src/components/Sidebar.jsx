import AddItemForm from "../devices/AddItemForm.jsx";
import { AddingLinkState } from "../models/AddingLinkState.js";
import { PingState } from "../models/PingState.js";
import routerImg from "../../images/router.png";
import computerImg from "../../images/computer.png";
import "./Sidebar.css";

export default function Sidebar({
  onAddDevice,
  addingLinkState,
  onToggleAddLink,
  showInterfaceIps,
  onToggleInterfaceIps,
  pingState = PingState.NORMAL,
  onTogglePing,
}) {
  const isLinking = addingLinkState !== AddingLinkState.NORMAL;
  const isPinging = pingState !== PingState.NORMAL;

  const linkHint =
    addingLinkState === AddingLinkState.SELECTING_SOURCE
      ? "Kliknij urządzenie źródłowe"
      : addingLinkState === AddingLinkState.SELECTING_DESTINATION
        ? "Kliknij urządzenie docelowe"
        : null;

  const pingHint =
    pingState === PingState.SELECTING_SOURCE
      ? "Kliknij urządzenie źródłowe"
      : pingState === PingState.SELECTING_DESTINATION
        ? "Kliknij urządzenie docelowe"
        : pingState === PingState.ANIMATING
          ? "Ping w toku…"
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
          <h2 className="sidebar__heading">Narzędzia</h2>
          <button
            className={`sidebar__link-btn sidebar__ping-btn ${isPinging ? "is-active" : ""}`}
            onClick={onTogglePing}
          >
            {isPinging ? "📡 Anuluj ping" : "📡 Ping"}
          </button>
          {pingHint && <p className="sidebar__hint sidebar__hint--ping">{pingHint}</p>}
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


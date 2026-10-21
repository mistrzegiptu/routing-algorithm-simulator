import { memo } from "react";
import AddItemForm from "../devices/AddItemForm.jsx";
import SidePanel from "./SidePanel.jsx";
import { AddingLinkState, linkHint } from "../models/AddingLinkState.js";
import routerImg from "../../images/router.png";
import computerImg from "../../images/computer.png";
import "./Sidebar.css";

function SimulationEditPanel({ onAddDevice, addingLinkState, onToggleAddLink, onClose }) {
  const isLinking = addingLinkState !== AddingLinkState.NORMAL;
  const hint = linkHint(addingLinkState);

  return (
    <SidePanel
      title="Edycja topologii"
      subtitle="Zmiany od razu trafiają do symulacji"
      onClose={onClose}
      className="side-panel--spacious"
    >
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
          type="button"
          className={`sidebar__link-btn ${isLinking ? "is-active" : ""}`}
          onClick={onToggleAddLink}
        >
          {isLinking ? "Anuluj łączenie" : "+ Dodaj połączenie"}
        </button>
        {hint && <p className="sidebar__hint">{hint}</p>}
      </section>

      <p className="sim-note">
        Usuwanie: najedź na urządzenie lub łącze i kliknij ✕. Parametry łącza: dwuklik na łączu.
        Adresy i trasy: kliknij urządzenie.
      </p>
    </SidePanel>
  );
}

export default memo(SimulationEditPanel);

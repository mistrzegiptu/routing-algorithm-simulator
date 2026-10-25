import React from "react";
import AddItemForm from "../devices/AddItemForm.jsx";
import ModeSwitch from "./ModeSwitch.jsx";
import { AddingLinkState, linkHint as linkHintFor } from "../models/AddingLinkState.js";
import { PingState } from "../models/PingState.js";
import routerImg from "../../images/router.png";
import computerImg from "../../images/computer.png";
import "./Sidebar.css";

import { exportNetwork, importNetwork } from "../api/device_api.js";

export default function Sidebar({
  onAddDevice,
  addingLinkState,
  onToggleAddLink,
  showInterfaceIps,
  onToggleInterfaceIps,
  pingState = PingState.NORMAL,
  onTogglePing,
  onImport,
  mode,
  onSwitchMode,
  pingSource,
  pingDest,
  pingSourcePorts,
  pingDestPorts,
  pingSourceIp,
  pingDestIp,
  onSourceIpSelect,
  onDestIpSelect,
  onSendPing
}) {
  const isLinking = addingLinkState !== AddingLinkState.NORMAL;
  const isPinging = pingState !== PingState.NORMAL;

  const linkHint = linkHintFor(addingLinkState);

  const pingHint =
    pingState === PingState.SELECTING_SOURCE
      ? "Kliknij urządzenie źródłowe"
      : pingState === PingState.SELECTING_DESTINATION
        ? "Kliknij urządzenie docelowe"
        : pingState === PingState.READY_TO_SEND
          ? "Wybierz adresy IP i wyślij ping"
          : pingState === PingState.ANIMATING
            ? "Ping w toku…"
            : null;

  const exportHandler = async () => {
    try {
      const data = await exportNetwork();

      const jsonData = JSON.stringify(data, null, 2);
      console.log("Exported data:", jsonData);
      const tempFile = new Blob([jsonData], { type: "application/json"});
      const url = window.URL.createObjectURL(tempFile);
      const a = document.createElement("a");

      a.href = url;
      a.download = "network_topology.json";
      document.body.appendChild(a);
      a.click();

      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Err: ", err);
      alert("Wystąpił błąd podczas próby eksportu topologii sieci");
    }
  }

  const fileInputRef = React.useRef(null);

  const importHandler = async () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }

  const fileChangeImportHandler = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const data = await file.text();
      const jsonData = JSON.parse(data);
      await importNetwork(jsonData);
      const imported = await exportNetwork();
      onImport(imported.devices_db, imported.links_db);
    } catch (err) {
      console.error("Err: ", err);
      alert(`Błąd podczas próby importu topologii.\n\n${err.message}`);
    } finally {
      event.target.value = null;
    }
  }

  return (
    <aside className="sidebar">
      <header className="sidebar__brand">
        <span className="sidebar__logo">◈</span>
        <div>
          <div className="sidebar__title">Routing Simulator</div>
          <div className="sidebar__subtitle">Topologia sieci</div>
        </div>
      </header>

      <ModeSwitch mode={mode} onSwitchMode={onSwitchMode} />

      <div className="sidebar__scroll">
        <section className="sidebar__section">
          <button onClick={importHandler}>
            Import
          </button>
          <button onClick={exportHandler}>
            Eksport
          </button>
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
          {pingSource != null && (
              <label>
                <span>IP źródłowe</span>
                <select 
                  value={pingSourceIp ?? ""}
                  onChange={event => onSourceIpSelect(event.target.value)}
                  className="sim-select"
                >
                <option value="">Wybierz adres IP</option>
               {pingSourcePorts.map(port => (
                <option key={port.ip} value={port.ip}>{port.ip}</option>
              ))}
                </select>
              </label>
          )}

          {pingDest != null && (
            <label>
              <span>IP docelowe</span>
              <select 
                value={pingDestIp ?? ""}
                onChange={event => onDestIpSelect(event.target.value)}
                className="sim-select"
              >
                  <option value="">Wybierz adres IP</option>
                  {pingDestPorts.map(port => (
                    <option key={port.ip} value={port.ip}>{port.ip}</option>
                  ))}
              </select>
            </label>
          )}
          <button
            className={`sidebar__link-btn sidebar__ping-btn ${isPinging ? "is-active" : ""}`}
            onClick={onTogglePing}
          >
            {isPinging ? "📡 Anuluj ping" : "📡 Ping"}
          </button>
          <button
            className="sidebar__link-btn"
            onClick={onSendPing}
            disabled={pingState !== PingState.READY_TO_SEND || !pingSourceIp || !pingDestIp}
          >
            Wyślij ping
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
      <input type="file" ref={fileInputRef} onChange={fileChangeImportHandler} style={{display: 'none'}}/>
    </aside>
  );
}


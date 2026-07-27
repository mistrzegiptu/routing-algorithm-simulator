import { useState, useEffect } from "react";
import { getRouteTable, addRoute, deleteRoute } from "../api/device_api";
import "./DeviceDetailsPanel.css";

export default function DeviceDetailsPanel({device, onClose, onSave, onDelete}) {
    const [name, setName] = useState("");
    const [ports, setPorts] = useState([]);
    const [routeTable, setRouteTable] = useState([]);
    const [routeTableLoading, setRouteTableLoading] = useState(false);

    const [routeDest, setRouteDest] = useState("");
    const [routeMask, setRouteMask] = useState(24);
    const [nextHop, setNextHop] = useState("");
    const [isAddingRoute, setIsAddingRoute] = useState(false);

    useEffect(() => {
        if (device) {
          setName(device.name || "");
          setPorts(Array.isArray(device.ports) ? device.ports.map(p => ({ ...p })) : []);
        }
      }, [device]
    );

    useEffect(() => {
        if (!device) return;
        setRouteTableLoading(true);

        getRouteTable(device.id)
            .then((data) => {
                setRouteTable(data.routes || []);
                setRouteTableLoading(false);
            })
            .catch((err) => {
                console.error(err);
                setRouteTableLoading(false);
            });
    }, [device]);

    if (!device) return null;

    const handlePortChange = (index, field, value) => {
        setPorts(prev => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const formattedPorts = ports.map(p => ({
        ...p,
        mask: parseInt(p.mask, 10) || 24,
        }));
        onSave(device.id, { name, ports: formattedPorts });
    };

    const addStaticRoute = async (e) => {
        e.preventDefault();
        setIsAddingRoute(true);

        const routeData = {
            dest: routeDest,
            mask: parseInt(routeMask, 10),
            next_hop: nextHop,
            entry_type: "static"
        }

        try {
            await addRoute(device.id, routeData);
            const data = await getRouteTable(device.id);
            setRouteTable(data.routes || []);

            setRouteDest("");
            setRouteMask(24);
            setNextHop("");
        } catch (err) {
            alert("Nie udało się znaleźć trasy");
        } finally {
            setIsAddingRoute(false);
        }
    }

    const handleDeleteRoute = async (routeToDelete) => {
        try {
            await deleteRoute(device.id, {
                ip: routeToDelete.dest,
                mask: routeToDelete.mask
            });

            const data = await getRouteTable(device.id);
            setRouteTable(data.routes || []);
        } catch (err) {
            alert("Error");
        }
    }

    return (
        <aside className="right-panel">
        <header className="right-panel-header">
            <div>
            <h2>{device.name}</h2>
            <span className={`badge badge--${device.type}`}>
                {device.type === 'router' ? 'Router' : 'Komputer'}
            </span>
            </div>
            <button className="close-btn" onClick={onClose} title="Zamknij" aria-label="Zamknij">
                <svg className="close-btn__icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
            </button>
        </header>

        <div className="right-panel-content">
            
            {/* --- SEKCJA 1: FORMULARZ --- */}
            <section className="panel-section">
            <h3>Konfiguracja portów</h3>
            <form onSubmit={handleSubmit} className="device-form">
                <label className="form-field">
                <span>Nazwa</span>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                </label>

                <div className="ports-list">
                <h4>Interfejsy ({ports.length})</h4>
                {ports.length === 0 && (
                    <p className="empty-text">Brak interfejsów.</p>
                )}
                {ports.map((port, index) => (
                    <div key={index} className="port-item">
                    <span className="port-tag">eth{index}</span>
                    <div className="port-inputs">
                        <label>
                        IP: <input type="text" value={port.ip || ''} onChange={(e) => handlePortChange(index, 'ip', e.target.value)} />
                        </label>
                        <label>
                        Maska: <input type="number" min="0" max="32" value={port.mask ?? ''} onChange={(e) => handlePortChange(index, 'mask', e.target.value)} />
                        </label>
                    </div>
                    </div>
                ))}
                </div>
                <button type="submit" className="btn-primary">Zapisz zmiany</button>
            </form>
            </section>

            <hr />

            {/* --- SEKCJA 2: TABLICA ROUTINGU --- */}
            <section className="panel-section">
            <h3>Tablica Routingu</h3>
            
            {routeTableLoading ? (
                <p className="loading-text">Pobieranie tras z serwera...</p>
            ) : (
                <table className="routing-table">
                <thead>
                    <tr>
                    <th>Sieć docelowa</th>
                    <th>Next Hop</th>
                    <th>Typ</th>
                    </tr>
                </thead>
                <tbody>
                    {routeTable.length === 0 ? (
                    <tr>
                        <td colSpan="3" className="empty-text">Brak wpisów w tablicy.</td>
                    </tr>
                    ) : (
                    routeTable.map((route, idx) => (
                        <tr key={idx}>
                        <td>{route.dest}/{route.mask}</td>
                        <td>{route.next_hop}</td>
                        <td><span className={`route-type ${route.entry_type}`}>{route.entry_type}</span></td>
                        <td><div className="route-cell-content">
                            {route.entry_type === 'static' && (
                                <button 
                                    className="delete-route-btn" 
                                    onClick={() => handleDeleteRoute(route)}
                                    title="Usuń trasę"
                                >
                                    🗑️
                                </button>
                            )}
                        </div></td>
                        </tr>
                    ))
                    )}
                </tbody>
                </table>
            )}

            <form onSubmit={addStaticRoute} className="add-route-form">
                <h4>Dodaj trasę</h4>
                <div className="add-route-inputs">
                    <input type="text" placeholder="Sieć docelowa" value={routeDest} onChange={(e) => setRouteDest(e.target.value)} required/>
                    <input type="text" placeholder="Maska" value={routeMask} onChange={(e) => setRouteMask(e.target.value)} required/>
                    <input type="text" placeholder="Next hop" value={nextHop} onChange={(e) => setNextHop(e.target.value)} required/>
                    <button type="submit" className="btn-primary" disabled={isAddingRoute}>{isAddingRoute ? "Dodawanie..." : "Dodaj"}</button>
                </div>
            </form>
            </section>

            <hr />

            {/* --- SEKCJA 3: STREFA USUWANIA --- */}
            <section className="panel-section danger-zone">
            <h3>Strefa usuwania</h3>
            <p className="empty-text">Usunięcie urządzenia skasuje też wszystkie jego połączenia.</p>
            <button
                type="button"
                className="btn-danger"
                onClick={() => onDelete?.(device.id)}
            >
                🗑️ Usuń urządzenie
            </button>
            </section>

        </div>
        </aside>
    );
}
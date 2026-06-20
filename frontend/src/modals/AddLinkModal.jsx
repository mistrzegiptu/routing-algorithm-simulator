import { useState } from 'react';
import "./AddLinkModal.css";

export default function AddLinkModal({ sourceId, destId, sourceName, destName, onAddLink, onClose }) {
    const [bandwidth, setBandwidth] = useState("");
    const [unit, setUnit] = useState('Mbps');
    const [delay, setDelay] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        onAddLink({
            sourceId,
            destId,
            bandwidth: bandwidth ? parseInt(bandwidth, 10) : null,
            bandwidthUnit: unit,
            delay: delay ? parseInt(delay, 10) : 10,
        });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-window" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose} aria-label="Zamknij">×</button>
                <h2 className="modal-title">Nowe połączenie</h2>

                <div className="link-endpoints">
                    <span className="link-endpoints__pill">{sourceName ?? `#${sourceId}`}</span>
                    <span className="link-endpoints__arrow">↔</span>
                    <span className="link-endpoints__pill">{destName ?? `#${destId}`}</span>
                </div>
                <p className="modal-note">Interfejsy zostaną przydzielone automatycznie.</p>

                <form onSubmit={handleSubmit} className="modal-form">
                    <label className="modal-field">
                        <span className="modal-label">Przepustowość</span>
                        <div className="modal-inline">
                            <input
                                type="number"
                                min="0"
                                placeholder="np. 100"
                                value={bandwidth}
                                onChange={(e) => setBandwidth(e.target.value)}
                            />
                            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                                <option value="Mbps">Mbps</option>
                                <option value="Gbps">Gbps</option>
                            </select>
                        </div>
                    </label>

                    <label className="modal-field">
                        <span className="modal-label">Opóźnienie (ms)</span>
                        <input
                            type="number"
                            min="0"
                            placeholder="domyślnie 10"
                            value={delay}
                            onChange={(e) => setDelay(e.target.value)}
                        />
                    </label>

                    <div className="modal-actions">
                        <button type="button" className="modal-btn modal-btn--ghost" onClick={onClose}>
                            Anuluj
                        </button>
                        <button type="submit" className="modal-btn modal-btn--primary">
                            Dodaj łącze
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

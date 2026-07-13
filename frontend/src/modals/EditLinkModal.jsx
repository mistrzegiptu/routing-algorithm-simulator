import { useState } from 'react';
import "./EditLinkModal.css";

export default function EditLinkModal({
    sourceName,
    destName,
    bandwidth: initialBandwidth,
    unit: initialUnit,
    delay: initialDelay,
    onSave,
    onDelete,
    onClose,
}) {
    const [bandwidth, setBandwidth] = useState(initialBandwidth ?? "");
    const [unit, setUnit] = useState(initialUnit ?? 'Mbps');
    const [delay, setDelay] = useState(initialDelay ?? "");

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            bandwidth: bandwidth ? parseInt(bandwidth, 10) : null,
            unit,
            delay: delay ? parseInt(delay, 10) : 10,
        });
    };

    const handleDelete = () => {
        onDelete();
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-window" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose} aria-label="Zamknij">×</button>
                <h2 className="modal-title">Parametry połączenia</h2>

                <div className="link-endpoints">
                    <span className="link-endpoints__pill">{sourceName}</span>
                    <span className="link-endpoints__arrow">↔</span>
                    <span className="link-endpoints__pill">{destName}</span>
                </div>

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

                    <div className="modal-actions modal-actions--split">
                        <button type="button" className="modal-btn modal-btn--danger-ghost" onClick={handleDelete}>
                            Usuń połączenie
                        </button>
                        <div className="modal-actions__right">
                            <button type="button" className="modal-btn modal-btn--ghost" onClick={onClose}>
                                Anuluj
                            </button>
                            <button type="submit" className="modal-btn modal-btn--primary">
                                Zapisz
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}

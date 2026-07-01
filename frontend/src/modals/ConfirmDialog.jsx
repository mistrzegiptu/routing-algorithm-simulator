import "./ConfirmDialog.css";

/**
 * Reusable confirmation dialog. Kept generic so it works both on the modeling
 * screen and the upcoming simulation screen (e.g. dynamically removing a device
 * mid-simulation).
 */
export default function ConfirmDialog({
    title,
    message,
    confirmLabel = "Potwierdź",
    cancelLabel = "Anuluj",
    danger = false,
    onConfirm,
    onCancel,
}) {
    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal-window confirm-window" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onCancel} aria-label="Zamknij">×</button>
                <h2 className="modal-title">{title}</h2>

                {message && <p className="confirm-message">{message}</p>}

                <div className="modal-actions">
                    <button type="button" className="modal-btn modal-btn--ghost" onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        className={`modal-btn ${danger ? "modal-btn--danger" : "modal-btn--primary"}`}
                        onClick={onConfirm}
                        autoFocus
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

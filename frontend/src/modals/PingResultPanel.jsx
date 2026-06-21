import './PingResultPanel.css';

export default function PingResultPanel({ pingResult, onReplay, onClose }) {
    if (!pingResult) return null;

    const { success, hops, total_delay, hop_count, message } = pingResult;

    return (
        <div className="ping-result-panel">
            <div className="ping-result-header">
                <div className="ping-result-title">
                    <span className="ping-result-icon">{success ? '✅' : '❌'}</span>
                    <span>{success ? 'Ping Successful' : 'Ping Failed'}</span>
                </div>
                <button className="ping-result-close" onClick={onClose}>✕</button>
            </div>

            <div className={`ping-result-message ${success ? 'success' : 'fail'}`}>
                {message}
            </div>

            {success && hop_count > 0 && (
                <>
                    <div className="ping-result-stats">
                        <div className="ping-stat">
                            <div className="ping-stat-value">{hop_count}</div>
                            <div className="ping-stat-label">Hops</div>
                        </div>
                        <div className="ping-stat">
                            <div className="ping-stat-value">{total_delay}</div>
                            <div className="ping-stat-label">Total ms</div>
                        </div>
                        <div className="ping-stat">
                            <div className="ping-stat-value">
                                {hop_count > 0 ? Math.round(total_delay / hop_count) : 0}
                            </div>
                            <div className="ping-stat-label">Avg ms/hop</div>
                        </div>
                    </div>

                    <div className="ping-hops-title">Route hops</div>
                    <div className="ping-hops-list">
                        {hops.map((hop, index) => (
                            <div key={index} className="ping-hop-item">
                                <span className="ping-hop-index">{index + 1}</span>
                                <span className="ping-hop-route">
                                    {hop.from_name}
                                    <span className="ping-hop-arrow"> → </span>
                                    {hop.to_name}
                                </span>
                                <span className="ping-hop-delay">{hop.delay}ms</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <div className="ping-result-actions">
                {success && hop_count > 0 && (
                    <button className="ping-btn ping-btn-replay" onClick={onReplay}>
                        🔄 Replay
                    </button>
                )}
                <button className="ping-btn ping-btn-close" onClick={onClose}>
                    Zamknij
                </button>
            </div>
        </div>
    );
}

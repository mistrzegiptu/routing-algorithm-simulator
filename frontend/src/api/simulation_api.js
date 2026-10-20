const API_URL = "http://localhost:5000/api";
const WS_URL = "ws://localhost:5000/ws/simulation";

export async function fetchAlgorithms() {
    const res = await fetch(`${API_URL}/simulation/algorithms`);
    if (!res.ok) {
        throw new Error("Failed to fetch simulation algorithms");
    }
    const data = await res.json();
    return data.algorithms || [];
}

/**
 * Client of /ws/simulation (protocol: docs/simulation-design.md §8).
 * The component only wires callbacks; all message plumbing lives here, so the
 * future SimulationOverlay reuses this class unchanged.
 */
export class SimulationSocket {
    constructor({ onEvent, onStatus, onFinished, onError, onPingSent, onClose, onLinkDisconnected } = {}) {
        this.onEvent = onEvent;
        this.onStatus = onStatus;
        this.onFinished = onFinished;
        this.onError = onError;
        this.onPingSent = onPingSent;
        this.onClose = onClose;
        this.ws = null;
        this.onLinkDisconnected = onLinkDisconnected;
    }

    connect() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(WS_URL);
            this.ws = ws;

            ws.onopen = () => resolve(this);
            ws.onerror = () => {
                reject(new Error("Nie udało się połączyć z symulacją"));
            };
            ws.onclose = () => {
                this.ws = null;
                this.onClose?.();
            };
            ws.onmessage = (e) => {
                let msg;
                try {
                    msg = JSON.parse(e.data);
                } catch {
                    return;
                }
                if (msg.type === "sim_event") this.onEvent?.(msg.event);
                else if (msg.type === "status") this.onStatus?.(msg);
                else if (msg.type === "finished") this.onFinished?.(msg);
                else if (msg.type === "error") this.onError?.(msg.message);
                else if (msg.type === "ping_sent") this.onPingSent?.(msg);
                else if (msg.type === "link_disconnected") this.onLinkDisconnected?.(msg.link_id);
            };
        });
    }

    get isOpen() {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    // The world starts empty of traffic — pings are injected later via ping().
    start({ algorithm, speed, seed }) {
        this._send({ action: "start", algorithm, speed, seed });
    }

    ping(sourceId, targetId) {
        this._send({ action: "ping", source_id: sourceId, target_id: targetId });
    }

    pause() { this._send({ action: "pause" }); }
    resume() { this._send({ action: "resume" }); }
    step() { this._send({ action: "step" }); }
    stop() { this._send({ action: "stop" }); }
    setSpeed(speed) { this._send({ action: "set_speed", speed }); }

    close() {
        this.ws?.close();
        this.ws = null;
    }

    _send(payload) {
        if (this.isOpen) {
            this.ws.send(JSON.stringify(payload));
        }
    }
}

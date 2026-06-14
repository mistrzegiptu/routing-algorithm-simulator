import {useState, useEffect} from 'react';
import "./AddLinkModal.css";
import { getAvailablePorts } from "../api/device_api.js";

export default function AddLinkModal({sourceId, destId, onAddLink, onClose}) {
    const [sourcePort, setSourcePort] = useState("0");
    const [destPort, setDestPort] = useState("0");
    const [bandwidth, setBandwidth] = useState("");
    const [unit, setUnit] = useState('Mbps');
    const [delay, setDelay] = useState("");

    const [sourcePorts, setSourcePorts] = useState([]);
    const [destPorts, setDestPorts] = useState([]);

    useEffect(() => {
        const fetchSourcePorts = async () => {
            const ports = await getAvailablePorts(sourceId);
            setSourcePorts(ports);
            if (ports && ports.length > 0) {
                setSourcePort(ports[0].toString());
            }
        }

        const fetchDestPorts = async () => {
            const ports = await getAvailablePorts(destId);
            setDestPorts(ports);
            if (ports && ports.length > 0) {
                setDestPort(ports[0].toString());
            }
        }

        fetchSourcePorts();
        fetchDestPorts();
    }, [sourceId, destId]);



    const handleSubmit = (e) => {
        e.preventDefault();
        onAddLink({
            sourceId,
            destId,
            sourcePort: parseInt(sourcePort, 10),
            destPort: parseInt(destPort, 10),
            bandwidth: bandwidth ? parseInt(bandwidth, 10) : null,
            bandwidthUnit: unit,
            delay: delay ? parseInt(delay, 10) : 10,
        });
    };

    return (
        <div className="modal">
            <div className="modal-window">
                <button className="close-button" onClick={onClose}>X</button>
                <h2>Dodaj połączenie</h2>
                <form onSubmit={handleSubmit}>
                    <div>Wybierz 2 urządzenia</div>
                    <div className="form-group">
                        <select value={sourcePort} onChange={(e) => setSourcePort(e.target.value)}>
                            {sourcePorts && sourcePorts.map(port => (
                                <option key={port} value={port}>Port: {port}</option>
                            ))}
                        </select>
                        <select value={destPort} onChange={(e) => setDestPort(e.target.value)}>
                            {destPorts && destPorts.map(port => (
                                <option key={port} value={port}>Port: {port}</option>
                            ))}
                        </select>
                    </div>

                    <div className="para-form">
                        <input type="number" placeholder="Przepustowość" value={bandwidth} onChange={(e) => setBandwidth(e.target.value)} />
                        <input type="number" placeholder="Opóźnienie (ms)" value={delay} onChange={(e) => setDelay(e.target.value)} />
                        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                            <option value="Mbps">Mbps</option>
                            <option value="Gbps">Gbps</option>
                        </select>
                    </div>

                    <button type="submit">Dodaj łącze</button>
                </form>
            </div>
        </div>);
}
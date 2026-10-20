import { useState, useCallback, useRef } from 'react';

export function useSimulationState(links) {
    // Simulation-screen state: interactive ping picking on a running world.
    const simSidebarRef = useRef(null);
    const [simRunning, setSimRunning] = useState(false);
    const [simPingSourceId, setSimPingSourceId] = useState(null);
    const [simState, setSimState] = useState('idle');
    const [simSpeed, setSimSpeed] = useState(0.1);
    const [simSegments, setSimSegments] = useState({});

    // --- Simulation ping: click source, click target, packet flies ---
    const handleSimStatusChange = useCallback((state) => {
        const active = state === 'running' || state === 'paused';
        setSimState(state);
        setSimRunning(active);
        if (!active) {
        setSimPingSourceId(null);
        setSimSegments({});
        }
    }, []);

    const handleSimReset = useCallback(() => setSimSegments({}), []);

    const handleSimEvent = useCallback((ev) => {
        const id = ev.packet_id;
        if (!id) return;
        if (ev.type === 'packet_sent') {
        // Flooding forwards the same packet_id over several links at once, so the
        // link_id has to be part of the key or each copy overwrites the last one.
        const key = `${id}:${ev.link_id}`;
        const link = links.find(l => l.id === ev.link_id);
        const delay = link?.delay ?? 10;
        setSimSegments(prev => ({
            ...prev,
            [key]: {
            key,
            from_id: ev.from_id,
            to_id: ev.to_id,
            t_sent: ev.t,
            t_recv: ev.t + delay,
            kind: ev.kind,
            icmp: ev.payload?.icmp,
            },
        }));
        } else if (ev.type === 'packet_recv') {
        const key = `${id}:${ev.link_id}`;
        setSimSegments(prev => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
        } else if (ev.type === 'packet_dropped' && ev.payload?.reason === 'link_disconnected') {
            const key = `${id}:${ev.link_id}`;
            setSimSegments(prev => {
                if (!(key in prev)) return prev;
                const next = { ...prev };
                delete next[key];
                return next;
            });
        } else if (ev.type === 'packet_delivered' || ev.type === 'packet_dropped') {
        // No link_id on these events, so match the in-flight copy that was headed
        // to this node without touching sibling copies still flying elsewhere.
        setSimSegments(prev => {
            let changed = false;
            const next = {};
            for (const [k, v] of Object.entries(prev)) {
            if (k.startsWith(`${id}:`) && v.to_id === ev.node_id) {
                changed = true;
                continue;
            }
            next[k] = v;
            }
            return changed ? next : prev;
        });
        }
    }, [links]);

    const handleSimDeviceClick = useCallback((id) => {
        if (!simRunning) return;
        if (simPingSourceId === null) {
            setSimPingSourceId(id);
        } else if (id === simPingSourceId) {
            setSimPingSourceId(null);
        } else {
            simSidebarRef.current?.sendPing(simPingSourceId, id);
            setSimPingSourceId(null);
        }
    }, [simRunning, simPingSourceId]);
    
    const handleSimPaneClick = useCallback(() => setSimPingSourceId(null),[]);

    return {
        simSidebarRef,
        simRunning,
        setSimRunning,
        simPingSourceId,
        simState,
        simSpeed,
        setSimSpeed,
        simSegments,
        handleSimEvent,
        handleSimReset,
        handleSimStatusChange,
        handleSimDeviceClick,
        handleSimPaneClick,
        setSimPingSourceId
    }
}
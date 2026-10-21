import { useState, useCallback, useRef, useEffect } from 'react';
import { useSimStats } from '../components/useSimStats.js';
import { formatEvent } from '../utils/simEvents.js';

const LOG_LIMIT = 300;
const FLUSH_MS = 100;

function withoutKey(prev, key) {
    if (!(key in prev)) return prev;
    const next = { ...prev };
    delete next[key];
    return next;
}

export function useSimulationState(devices, links) {
    const simSidebarRef = useRef(null);
    const [simRunning, setSimRunning] = useState(false);
    const [simPingSourceId, setSimPingSourceId] = useState(null);
    const [simState, setSimState] = useState('idle');
    const [simSpeed, setSimSpeed] = useState(0.1);
    const [simSegments, setSimSegments] = useState({});
    const [simLog, setSimLog] = useState([]);
    const [simTables, setSimTables] = useState({});

    const { statsSnap, derived, accumulateStats, recordPingSent, resetStats, getLatestStats } = useSimStats(simState);

    const devicesRef = useRef(devices);
    const linksRef = useRef(links);
    useEffect(() => {
        devicesRef.current = devices;
        linksRef.current = links;
    }, [devices, links]);

    const pendingRef = useRef([]);
    const flushTimerRef = useRef(null);
    const logSeqRef = useRef(0);

    useEffect(() => () => clearTimeout(flushTimerRef.current), []);

    const flushPending = useCallback(() => {
        flushTimerRef.current = null;
        const batch = pendingRef.current;
        pendingRef.current = [];

        const nameOf = (id) =>
            devicesRef.current.find((d) => d.id === id)?.name ??
            (id === null || id === undefined ? "?" : `#${id}`);
        const lines = batch
            .map((ev) => formatEvent(ev, nameOf))
            .filter(Boolean)
            .map((line) => ({ ...line, id: ++logSeqRef.current }));
        if (lines.length) setSimLog((prev) => [...prev, ...lines].slice(-LOG_LIMIT));

        const tableEvents = batch.filter((ev) =>
            ev.type === 'table_update' ||
            (ev.type === 'topology_change' && ev.payload?.change === 'node_removed'));
        if (tableEvents.length) {
            setSimTables((prev) => {
                const next = { ...prev };
                for (const ev of tableEvents) {
                    if (ev.type === 'table_update') next[ev.node_id] = { t: ev.t, routes: ev.payload?.routes ?? [] };
                    else delete next[ev.node_id];
                }
                return next;
            });
        }
    }, []);

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

    const handleSimReset = useCallback(() => {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
        pendingRef.current = [];
        setSimSegments({});
        setSimLog([]);
        setSimTables({});
        resetStats();
    }, [resetStats]);

    const handleSimEvent = useCallback((ev) => {
        accumulateStats(ev);
        pendingRef.current.push(ev);
        if (flushTimerRef.current === null) flushTimerRef.current = setTimeout(flushPending, FLUSH_MS);

        const id = ev.packet_id;
        if (!id) return;
        // Flooding forwards the same packet_id over several links at once, so the
        // link_id has to be part of the key or each copy overwrites the last one.
        const key = `${id}:${ev.link_id}`;
        if (ev.type === 'packet_sent') {
            const delay = ev.payload?.delay ?? linksRef.current.find((l) => l.id === ev.link_id)?.delay ?? 10;
            setSimSegments((prev) => ({
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
        } else if (ev.type === 'packet_recv' || (ev.type === 'packet_dropped' && ev.link_id != null)) {
            setSimSegments((prev) => withoutKey(prev, key));
        }
    }, [accumulateStats, flushPending]);

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
        simLog,
        simTables,
        statsSnap,
        derived,
        recordPingSent,
        getLatestStats,
        handleSimEvent,
        handleSimReset,
        handleSimStatusChange,
        handleSimDeviceClick,
        handleSimPaneClick,
        setSimPingSourceId
    }
}

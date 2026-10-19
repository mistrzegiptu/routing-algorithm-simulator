import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Initial TTL from engine config (SimConfig default = 64).
const INITIAL_TTL = 64;

export function emptyStats() {
  return {
    // ── raw packet counters (all algorithms) ──
    packetsSent: 0,
    packetsDelivered: 0,
    packetsDropped: 0,
    controlPackets: 0,
    maxHops: 0,

    // ── ICMP / packet delivery details ──
    requestsDelivered: 0,   // ICMP echo requests reaching target
    repliesDelivered: 0,    // ICMP echo replies reaching origin
    duplicatesDropped: 0,   // packets filtered out as duplicates (e.g. flooding)

    // ── ping-level counters (correct at operation granularity) ──
    // pingsInitiated: incremented when the backend confirms a ping was injected
    //   (ping_sent WS message), NOT from packet_delivered — so lost pings count.
    pingsInitiated: 0,
    // pingsCompleted: deduplicated by ping_id from reply packet_delivered events;
    //   flooding many copies still yields exactly 1 completion per ping.
    pingsCompleted: 0,
    completedPingIds: new Set(),   // deduplicate reply deliveries
    // rttByPing: ping_id → best (lowest) RTT observed; for flooding each
    //   surviving copy may deliver a reply — we keep the fastest one.
    rttByPing: new Map(),

    // ── routing / convergence ──
    tableUpdates: 0,
    lastTableUpdateTime: null,
  };
}

/**
 * Compute display-ready values from raw counters.
 */
export function computeDerived(raw) {
  // ── Ping-level metrics (end-to-end operation) ──────────────────────────
  const pingSuccessRate =
    raw.pingsInitiated > 0
      ? (raw.pingsCompleted / raw.pingsInitiated) * 100
      : 0;

  const packetLoss =
    raw.pingsInitiated > 0
      ? (1 - raw.pingsCompleted / raw.pingsInitiated) * 100
      : 0;

  // ── Network-level packet delivery rate ────────────────────────────────
  const totalDecided = raw.packetsDelivered + raw.packetsDropped;
  const packetDeliveryRate =
    totalDecided > 0
      ? (raw.packetsDelivered / totalDecided) * 100
      : 0;

  // ── RTT across all completed pings ────────────────────────────────────
  const rttValues = raw.rttByPing ? [...raw.rttByPing.values()] : [];
  let avgRtt = 0, minRtt = 0, maxRtt = 0;
  if (rttValues.length > 0) {
    const sum = rttValues.reduce((a, b) => a + b, 0);
    avgRtt = sum / rttValues.length;
    minRtt = Math.min(...rttValues);
    maxRtt = Math.max(...rttValues);
  }

  return {
    pingSuccessRate,
    packetLoss,
    pingLoss: packetLoss,
    packetDeliveryRate,
    avgRtt,
    minRtt,
    maxRtt,
  };
}

function cloneRaw(raw) {
  return {
    ...raw,
    completedPingIds: new Set(raw.completedPingIds),
    rttByPing: new Map(raw.rttByPing),
  };
}

/**
 * useSimStats — custom hook that collects simulation statistics.
 *
 * Raw counters live in a ref (no re-render per event). A snapshot is
 * pushed to state every 500 ms while the simulation is active, plus a
 * final flush when it stops.
 *
 * Returns:
 *   statsSnap   — current snapshot of raw counters (state, triggers render)
 *   derived     — packetLoss, avgRtt, minRtt, maxRtt computed from snapshot
 *   accumulateStats(ev) — call for every sim_event received
 *   recordPingSent()    — call when a ping_sent WS message is received
 *   resetStats()        — call before starting a new run
 *   getLatestStats()    — returns { statsSnap, derived } clone directly from ref
 */
export function useSimStats(status) {
  const statsRef = useRef(emptyStats());
  const [statsSnap, setStatsSnap] = useState(emptyStats());
  const statsTimerRef = useRef(null);

  // Stats refresh tick — batches UI updates to avoid per-event re-renders.
  useEffect(() => {
    if (status === "running" || status === "paused") {
      statsTimerRef.current = setInterval(() => {
        setStatsSnap(cloneRaw(statsRef.current));
      }, 500);
    } else if (status === "finished") {
      // Push a final snapshot when simulation finishes.
      setStatsSnap(cloneRaw(statsRef.current));
      clearInterval(statsTimerRef.current);
    } else {
      clearInterval(statsTimerRef.current);
    }
    return () => clearInterval(statsTimerRef.current);
  }, [status]);

  // Called for every sim_event WebSocket message.
  const accumulateStats = useCallback((ev) => {
    const s = statsRef.current;
    const p = ev.payload || {};

    switch (ev.type) {
      case "packet_sent":
        s.packetsSent++;
        if (ev.kind === "control") s.controlPackets++;
        break;

      case "packet_delivered":
        s.packetsDelivered++;
        if (p.icmp === "request") {
          s.requestsDelivered++;
        }
        if (p.icmp === "reply") {
          s.repliesDelivered++;
          if (typeof p.rtt === "number") {
            const pingId = p.ping_id != null ? p.ping_id : p.request_id;
            if (pingId != null) {
              // Deduplicate: only count the first (or fastest) reply per ping operation.
              if (!s.completedPingIds.has(pingId)) {
                s.completedPingIds.add(pingId);
                s.pingsCompleted++;
              }
              // Keep the best (lowest) RTT for this ping (flooding may deliver many).
              const prev = s.rttByPing.get(pingId);
              if (prev === undefined || p.rtt < prev) {
                s.rttByPing.set(pingId, p.rtt);
              }
            } else {
              s.pingsCompleted++;
            }
          }
        }
        if (ev.kind !== "control" && typeof p.ttl === "number") {
          const hops = INITIAL_TTL - p.ttl;
          if (hops > s.maxHops) s.maxHops = hops;
        }
        break;

      case "packet_dropped":
        s.packetsDropped++;
        if (p.reason === "duplicate") {
          s.duplicatesDropped++;
        }
        break;

      case "table_update":
        s.tableUpdates++;
        s.lastTableUpdateTime = ev.t;
        break;

      default:
        break;
    }
  }, []);

  // Called when the backend confirms a user-initiated ping was injected.
  const recordPingSent = useCallback(() => {
    statsRef.current.pingsInitiated++;
  }, []);

  const resetStats = useCallback(() => {
    statsRef.current = emptyStats();
    setStatsSnap(emptyStats());
  }, []);

  const getLatestStats = useCallback(() => {
    const snap = cloneRaw(statsRef.current);
    return {
      statsSnap: snap,
      derived: computeDerived(snap),
    };
  }, []);

  const derived = useMemo(() => computeDerived(statsSnap), [statsSnap]);

  return {
    statsSnap,
    derived,
    accumulateStats,
    recordPingSent,
    onPingSent: recordPingSent,
    resetStats,
    getLatestStats,
  };
}

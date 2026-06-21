import { useState, useEffect, useRef, useCallback } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';

/**
 * Ping animation overlay rendered inside the ReactFlow <svg> viewport.
 * Uses a portal-like pattern: renders an absolutely positioned SVG
 * on top of the ReactFlow canvas that tracks the viewport transform.
 *
 * The animated packet (glowing circle) travels hop-by-hop between nodes.
 */
export default function PingOverlay({ hops, nodes, onComplete }) {
  const [currentHop, setCurrentHop] = useState(0);
  const [progress, setProgress] = useState(0);
  const [completedHops, setCompletedHops] = useState([]);
  const animRef = useRef(null);
  const startTimeRef = useRef(null);
  const { getNode } = useReactFlow();
  const viewport = useViewport();

  const HOP_DURATION_MS = 600;

  const getNodeCenter = useCallback((deviceId) => {
    const node = getNode(String(deviceId));
    if (!node) return null;
    // Node position + half of typical node size (estimated)
    const w = node.measured?.width ?? node.width ?? 120;
    const h = node.measured?.height ?? node.height ?? 100;
    return {
      x: node.position.x + w / 2,
      y: node.position.y + h / 2,
    };
  }, [getNode]);

  useEffect(() => {
    if (!hops || hops.length === 0) {
      onComplete?.();
      return;
    }

    setCurrentHop(0);
    setProgress(0);
    setCompletedHops([]);
    startTimeRef.current = null;

    const animate = (timestamp) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;

      const totalElapsed = timestamp - startTimeRef.current;
      const totalHopIndex = Math.floor(totalElapsed / HOP_DURATION_MS);
      const hopProgress = (totalElapsed % HOP_DURATION_MS) / HOP_DURATION_MS;

      if (totalHopIndex >= hops.length) {
        setCurrentHop(hops.length - 1);
        setProgress(1);
        setCompletedHops(hops.map((_, i) => i));
        onComplete?.();
        return;
      }

      setCurrentHop(totalHopIndex);
      setProgress(hopProgress);
      setCompletedHops(Array.from({ length: totalHopIndex }, (_, i) => i));

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [hops, onComplete]);

  if (!hops || hops.length === 0) return null;

  const hop = hops[currentHop];
  if (!hop) return null;

  const from = getNodeCenter(hop.from_id);
  const to = getNodeCenter(hop.to_id);
  if (!from || !to) return null;

  // Ease-in-out
  const eased = progress < 0.5
    ? 2 * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 2) / 2;

  const packetX = from.x + (to.x - from.x) * eased;
  const packetY = from.y + (to.y - from.y) * eased;

  // Transform: ReactFlow viewport coordinates → screen coordinates
  const { x: vx, y: vy, zoom } = viewport;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
        overflow: 'visible',
      }}
    >
      <g transform={`translate(${vx}, ${vy}) scale(${zoom})`}>
        {/* Glow filter */}
        <defs>
          <filter id="ping-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="ping-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="1" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.6" />
          </radialGradient>
        </defs>

        {/* Trail — completed hop dashed lines */}
        {completedHops.map(hopIdx => {
          const h = hops[hopIdx];
          const f = getNodeCenter(h.from_id);
          const t = getNodeCenter(h.to_id);
          if (!f || !t) return null;
          return (
            <line
              key={`trail-${hopIdx}`}
              x1={f.x} y1={f.y}
              x2={t.x} y2={t.y}
              stroke="#38bdf8"
              strokeWidth="4"
              strokeOpacity="0.4"
              strokeDasharray="8 4"
            />
          );
        })}

        {/* Current hop partial trail */}
        <line
          x1={from.x} y1={from.y}
          x2={packetX} y2={packetY}
          stroke="#38bdf8"
          strokeWidth="4"
          strokeOpacity="0.6"
          strokeDasharray="8 4"
        />

        {/* Outer glow ring */}
        <circle
          cx={packetX}
          cy={packetY}
          r={14}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2"
          strokeOpacity={0.3 + 0.3 * Math.sin(progress * Math.PI * 4)}
          filter="url(#ping-glow)"
        />

        {/* Main packet dot */}
        <circle
          cx={packetX}
          cy={packetY}
          r={8}
          fill="url(#ping-gradient)"
          filter="url(#ping-glow)"
        />

        {/* Inner bright core */}
        <circle
          cx={packetX}
          cy={packetY}
          r={3}
          fill="#ffffff"
          fillOpacity="0.9"
        />
      </g>
    </svg>
  );
}

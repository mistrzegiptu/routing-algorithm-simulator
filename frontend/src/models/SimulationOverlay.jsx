import { useEffect, useRef, useState, useCallback } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';

const PACKET_COLORS = {
  request: '#38bdf8',
  reply: '#34d399',
  control: '#f0a23b',
  data: '#a78bfa',
};

function colorFor(seg) {
  if (seg.kind === 'control') return PACKET_COLORS.control;
  if (seg.icmp === 'reply') return PACKET_COLORS.reply;
  if (seg.icmp === 'request') return PACKET_COLORS.request;
  return PACKET_COLORS.data;
}

function ease(p) {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export default function SimulationOverlay({ segments, speed, paused }) {
  const { getNode } = useReactFlow();
  const viewport = useViewport();
  const [dots, setDots] = useState([]);
  const clockRef = useRef(0);
  const lastWallRef = useRef(null);

  const getCenter = useCallback((id) => {
    const node = getNode(String(id));
    if (!node) return null;
    const w = node.measured?.width ?? node.width ?? 120;
    const h = node.measured?.height ?? node.height ?? 100;
    return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
  }, [getNode]);

  useEffect(() => {
    lastWallRef.current = null;
    let raf = null;

    const frame = (now) => {
      if (lastWallRef.current == null) lastWallRef.current = now;
      const dt = now - lastWallRef.current;
      lastWallRef.current = now;

      if (!paused) clockRef.current += dt * speed;
      for (const s of segments) if (s.t_sent > clockRef.current) clockRef.current = s.t_sent;
      const clock = clockRef.current;

      const next = segments.map((s) => {
        const from = getCenter(s.from_id);
        const to = getCenter(s.to_id);
        if (!from || !to) return null;
        const span = s.t_recv - s.t_sent;
        const raw = span > 0 ? (clock - s.t_sent) / span : 1;
        const p = raw < 0 ? 0 : raw > 1 ? 1 : raw;
        const e = ease(p);
        return {
          key: s.key,
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
          color: colorFor(s),
        };
      }).filter(Boolean);

      setDots(next);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [segments, speed, paused, getCenter]);

  if (dots.length === 0) return null;

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
      <defs>
        <filter id="sim-packet-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g transform={`translate(${vx}, ${vy}) scale(${zoom})`}>
        {dots.map((d) => (
          <g key={d.key}>
            <circle cx={d.x} cy={d.y} r={7} fill={d.color} filter="url(#sim-packet-glow)" />
            <circle cx={d.x} cy={d.y} r={2.5} fill="#ffffff" fillOpacity="0.9" />
          </g>
        ))}
      </g>
    </svg>
  );
}

import { useEffect, useRef, useCallback } from 'react';
import { useReactFlow, useStoreApi } from '@xyflow/react';

const SVG_NS = 'http://www.w3.org/2000/svg';

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

function createDot(color) {
  const glow = document.createElementNS(SVG_NS, 'circle');
  glow.setAttribute('r', '7');
  glow.setAttribute('fill', color);
  glow.setAttribute('filter', 'url(#sim-packet-glow)');
  const core = document.createElementNS(SVG_NS, 'circle');
  core.setAttribute('r', '2.5');
  core.setAttribute('fill', '#ffffff');
  core.setAttribute('fill-opacity', '0.9');
  const group = document.createElementNS(SVG_NS, 'g');
  group.append(glow, core);
  return { group, circles: [glow, core] };
}

export default function SimulationOverlay({ segments, speed, paused }) {
  const { getNode } = useReactFlow();
  const store = useStoreApi();
  const layerRef = useRef(null);
  const clockRef = useRef(0);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);

  useEffect(() => {
    speedRef.current = speed;
    pausedRef.current = paused;
  }, [speed, paused]);

  const getCenter = useCallback((id) => {
    const node = getNode(String(id));
    if (!node) return null;
    const w = node.measured?.width ?? node.width ?? 120;
    const h = node.measured?.height ?? node.height ?? 100;
    return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
  }, [getNode]);

  useEffect(() => {
    const layer = layerRef.current;
    const dots = new Map();
    let raf = null;
    let lastWall = null;

    const frame = (now) => {
      const dt = lastWall == null ? 0 : now - lastWall;
      lastWall = now;

      const inFlight = segments.current;
      if (!pausedRef.current) clockRef.current += dt * speedRef.current;
      for (const s of inFlight.values()) if (s.t_sent > clockRef.current) clockRef.current = s.t_sent;
      const clock = clockRef.current;
      for (const [key, s] of inFlight) if (s.received && clock >= s.t_recv) inFlight.delete(key);

      const [vx, vy, zoom] = store.getState().transform;
      layer.setAttribute('transform', `translate(${vx}, ${vy}) scale(${zoom})`);

      for (const [key, dot] of dots) {
        if (!inFlight.has(key)) {
          dot.group.remove();
          dots.delete(key);
        }
      }

      for (const s of inFlight.values()) {
        const from = getCenter(s.from_id);
        const to = getCenter(s.to_id);
        let dot = dots.get(s.key);
        if (!from || !to) {
          dot?.group.setAttribute('visibility', 'hidden');
          continue;
        }
        if (!dot) {
          dot = createDot(colorFor(s));
          layer.append(dot.group);
          dots.set(s.key, dot);
        }
        const span = s.t_recv - s.t_sent;
        const raw = span > 0 ? (clock - s.t_sent) / span : 1;
        const p = raw < 0 ? 0 : raw > 1 ? 1 : raw;
        const e = ease(p);
        const x = from.x + (to.x - from.x) * e;
        const y = from.y + (to.y - from.y) * e;
        for (const circle of dot.circles) {
          circle.setAttribute('cx', x);
          circle.setAttribute('cy', y);
        }
        dot.group.removeAttribute('visibility');
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      for (const dot of dots.values()) dot.group.remove();
    };
  }, [getCenter, segments, store]);

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
      <g ref={layerRef} />
    </svg>
  );
}

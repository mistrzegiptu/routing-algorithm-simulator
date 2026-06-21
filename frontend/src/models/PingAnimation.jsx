import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * SVG ping packet animation that travels along the path between devices.
 * Renders a glowing circle that moves hop-by-hop.
 */
export default function PingAnimation({ hops, devices, deviceSize, onComplete }) {
    const [currentHop, setCurrentHop] = useState(0);
    const [progress, setProgress] = useState(0); // 0..1 within current hop
    const [completedHops, setCompletedHops] = useState([]);
    const animRef = useRef(null);
    const startTimeRef = useRef(null);

    const HOP_DURATION_MS = 600;

    const getDeviceCenter = useCallback((deviceId) => {
        const device = devices.find(d => d.id === deviceId);
        if (!device) return { x: 0, y: 0 };
        const halfW = (deviceSize.width || 0) / 2;
        const halfH = (deviceSize.height || 0) / 2;
        return { x: device.x + halfW, y: device.y + halfH };
    }, [devices, deviceSize]);

    useEffect(() => {
        if (!hops || hops.length === 0) {
            onComplete?.();
            return;
        }

        setCurrentHop(0);
        setProgress(0);
        setCompletedHops([]);
        startTimeRef.current = performance.now();

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

    const from = getDeviceCenter(hop.from_id);
    const to = getDeviceCenter(hop.to_id);

    // Ease-in-out for smooth motion
    const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    const packetX = from.x + (to.x - from.x) * eased;
    const packetY = from.y + (to.y - from.y) * eased;

    return (
        <g className="ping-animation-layer">
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

            {/* Trail — completed hop lines */}
            {completedHops.map(hopIdx => {
                const h = hops[hopIdx];
                const f = getDeviceCenter(h.from_id);
                const t = getDeviceCenter(h.to_id);
                return (
                    <line
                        key={`trail-${hopIdx}`}
                        x1={f.x} y1={f.y}
                        x2={t.x} y2={t.y}
                        stroke="#38bdf8"
                        strokeWidth="4"
                        strokeOpacity="0.5"
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
                strokeOpacity="0.7"
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
    );
}

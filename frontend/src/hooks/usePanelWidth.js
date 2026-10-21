import { useRef, useState } from "react";

const MIN_WIDTH = 300;
const MAX_SCREEN_SHARE = 0.75;

function loadWidth(key, fallback) {
    try {
        const stored = Number(localStorage.getItem(key));
        return stored >= MIN_WIDTH ? stored : fallback;
    } catch {
        return fallback;
    }
}

function saveWidth(key, width) {
    try {
        localStorage.setItem(key, String(Math.round(width)));
        return true;
    } catch {
        return false;
    }
}

export function usePanelWidth(storageKey, defaultWidth) {
    const [width, setWidth] = useState(() => loadWidth(storageKey, defaultWidth));
    const dragRef = useRef(null);

    const stopDrag = () => {
        if (!dragRef.current) return;
        dragRef.current = null;
        document.body.classList.remove("is-resizing-panel");
        saveWidth(storageKey, width);
    };

    const handleProps = {
        onPointerDown: (e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = { startX: e.clientX, startWidth: width };
            document.body.classList.add("is-resizing-panel");
        },
        onPointerMove: (e) => {
            const drag = dragRef.current;
            if (!drag) return;
            const maxWidth = Math.max(MIN_WIDTH, window.innerWidth * MAX_SCREEN_SHARE);
            setWidth(Math.min(maxWidth, Math.max(MIN_WIDTH, drag.startWidth + drag.startX - e.clientX)));
        },
        onPointerUp: stopDrag,
        onPointerCancel: stopDrag,
        onDoubleClick: () => {
            setWidth(defaultWidth);
            saveWidth(storageKey, defaultWidth);
        },
    };

    return { width, handleProps };
}

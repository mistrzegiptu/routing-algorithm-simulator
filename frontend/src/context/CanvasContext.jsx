import { createContext, useState, useContext } from 'react';

const CanvasContext = createContext();

export function CanvasProvider({children}) {
    const [routerSize, setRouterSize] = useState({});

    const registerSize = (width, height) => {
    setRouterSize(prev => {
        if (prev.width === width && prev.height === height) {
            return prev;
        }
        
        return { "width": width, "height": height };
    });
}

    return (
        <CanvasContext.Provider value={{ routerSize, registerSize }}>
            {children}
        </CanvasContext.Provider>
    );
}

export const useCanvas = () => useContext(CanvasContext);
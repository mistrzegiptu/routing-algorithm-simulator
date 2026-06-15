import { createContext, useState, useContext } from 'react';

const CanvasContext = createContext();

export function CanvasProvider({ children }) {
    const [deviceSize, setDeviceSize] = useState({});

    const registerSize = (width, height) => {
        setDeviceSize(prev => {
            if (prev.width === width && prev.height === height) {
                return prev;
            }

            return { width, height };
        });
    };

    return (
        <CanvasContext.Provider value={{ deviceSize, registerSize }}>
            {children}
        </CanvasContext.Provider>
    );
}

export const useCanvas = () => useContext(CanvasContext);

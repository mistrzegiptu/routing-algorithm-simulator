import { useState, useCallback } from 'react';
import { AddingLinkState } from "../models/AddingLinkState.js";
import { PingState } from "../models/PingState.js";
import { pingDevice } from '../api/device_api';

export function useBuildTools(removeDevice, saveNewLink, simPingArmed) {
    const [selectedDeviceId, setSelectedDeviceId] = useState(null);
    const [devicePendingDeletion, setDevicePendingDeletion] = useState(null);
    const [selectedLinkId, setSelectedLinkId] = useState(null);
    
    const [addingLinkState, setAddingLinkState] = useState(AddingLinkState.NORMAL);
    const [sourceDevice, setSourceDevice] = useState(null);

    // Ping state
    const [pingState, setPingState] = useState(PingState.NORMAL);
    const [pingSource, setPingSource] = useState(null);
    const [pingResult, setPingResult] = useState(null);
    const [pingAnimating, setPingAnimating] = useState(false);
    const [highlightedLinkIds, setHighlightedLinkIds] = useState([]);

    const resetPing = useCallback(() => {
        setPingState(PingState.NORMAL);
        setPingSource(null);
        setPingResult(null);
        setPingAnimating(false);
        setHighlightedLinkIds([]);
    }, []);

    const resetLinkSelection = useCallback(() => {
        setAddingLinkState(AddingLinkState.NORMAL);
        setSourceDevice(null);
    }, []);

    const addLinkHandler = useCallback(() => {
        // Cancel ping mode if active
        if (pingState !== PingState.NORMAL) {
            resetPing();
        }
        setSourceDevice(null);
        setAddingLinkState(
            addingLinkState === AddingLinkState.NORMAL
                ? AddingLinkState.SELECTING_SOURCE
                : AddingLinkState.NORMAL
        );
    }, [pingState, resetPing, addingLinkState]);
    
    // --- Ping handlers ---
    const pingHandler = useCallback(() => {
        // Cancel link mode if active
        if (addingLinkState !== AddingLinkState.NORMAL) {
            resetLinkSelection();
        }
    
        if (pingState === PingState.NORMAL) {
            setPingSource(null);
            setPingResult(null);
            setPingAnimating(false);
            setHighlightedLinkIds([]);
            setPingState(PingState.SELECTING_SOURCE);
        } else {
            resetPing();
        }
    }, [addingLinkState, pingState, resetLinkSelection, resetPing]);
    
    const executePing = useCallback(async (sourceId, targetId) => {
        try {
            const result = await pingDevice(sourceId, targetId);
            setPingResult(result);
        
            if (result.success && result.hops.length > 0) {
                const linkIds = result.hops
                .map(hop => hop.link_id)
                .filter(id => id !== null && id !== undefined);
                setHighlightedLinkIds(linkIds);
        
                setPingAnimating(true);
                setPingState(PingState.ANIMATING);
            } else {
                setPingState(PingState.DONE);
            }
        } catch (error) {
            console.error("Ping error:", error);
            setPingResult({
                success: false,
                path: [],
                hops: [],
                total_delay: 0,
                hop_count: 0,
                message: `Error: ${error.message}`,
            });
        setPingState(PingState.DONE);
        }
    }, []);
    
    const handlePingAnimationComplete = useCallback(() => {
        setPingAnimating(false);
        setPingState(PingState.DONE);
    }, []);
    
    const handlePingReplay = useCallback(() => {
        if (pingResult && pingResult.success && pingResult.hops.length > 0) {
          setPingAnimating(true);
          setPingState(PingState.ANIMATING);
        }
    }, [pingResult]);

    const saveLink = useCallback(async (newLinkData) => {
        try {
            await saveNewLink(newLinkData);
            // Re-arm for the next pair instead of exiting linking mode entirely.
            setSourceDevice(null);
            setAddingLinkState(AddingLinkState.SELECTING_SOURCE);
        } catch (error) {
            console.error("Error saving link:", error);
            alert("Nie udało się dodać połączenia.");
        }
    }, [saveNewLink]);

    const handleSelectDevice = useCallback((id) => {
        // Ping mode takes priority when active
        if (pingState === PingState.SELECTING_SOURCE) {
            setPingSource(id);
            setPingState(PingState.SELECTING_DESTINATION);
            return;
        }
        if (pingState === PingState.SELECTING_DESTINATION) {
            if (id === pingSource) {
                alert("Nie można pingować tego samego urządzenia");
                return;
            }
            executePing(pingSource, id);
            return;
        }
    
        // Link mode — creating a link happens immediately on picking the second
        // device (no params modal), then the tool re-arms for the next pair so
        // many links can be made back-to-back.
        if (addingLinkState === AddingLinkState.SELECTING_SOURCE) {
            setSourceDevice(id);
            setAddingLinkState(AddingLinkState.SELECTING_DESTINATION);
        } else if (addingLinkState === AddingLinkState.SELECTING_DESTINATION) {
            if (id === sourceDevice) {
                alert("Cannot select the same device as destination");
                return;
            }
            saveLink({
                sourceId: sourceDevice,
                destId: id,
                bandwidth: 100,
                bandwidthUnit: 'Mbps',
                delay: 10,
            });
            }
      }, [pingState, pingSource, executePing, addingLinkState, sourceDevice, saveLink]);

    // --- Device deletion ---
    const requestDeleteDevice = useCallback((id) => {
        setDevicePendingDeletion(id);
    }, []);
    
    const cancelDeleteDevice = useCallback(() => setDevicePendingDeletion(null), []);
    
    const confirmDeleteDevice = useCallback(async () => {
        const id = devicePendingDeletion;
        if (id === null) return;
    
        try {
            await removeDevice(id);
        
            // Clear any state that might still reference the removed device.
            if (selectedDeviceId === id) setSelectedDeviceId(null);
            setHighlightedLinkIds([]);
            if (sourceDevice === id) resetLinkSelection();
            if (pingSource === id) resetPing();
        } catch (error) {
            console.error("Error deleting device:", error);
            alert("Nie udało się usunąć urządzenia.");
        } finally {
            setDevicePendingDeletion(null);
        }
    }, [selectedDeviceId, devicePendingDeletion, sourceDevice, pingSource, removeDevice, resetLinkSelection, resetPing]);
    
    const handleCloseConfig = useCallback(() => {
        setSelectedDeviceId(null);
    }, []);
    
    // --- Link editing (double-click) ---
    const requestConfigureLink = useCallback((id) => {
        if (addingLinkState === AddingLinkState.NORMAL && pingState === PingState.NORMAL && !simPingArmed) {
            setSelectedLinkId(id);
        }
    }, [addingLinkState, pingState, simPingArmed]);
    
    const handleCloseLinkConfig = useCallback(() => setSelectedLinkId(null), []);

    const handleConfigureDevice = useCallback((id) => {
        if (addingLinkState === AddingLinkState.NORMAL && pingState === PingState.NORMAL && !simPingArmed) {
            setSelectedDeviceId(id);
        }
    }, [addingLinkState, pingState, simPingArmed]);

    return {
        selectedDeviceId,
        setSelectedDeviceId,
        devicePendingDeletion,
        selectedLinkId,
        setSelectedLinkId,
        addingLinkState,
        sourceDevice,
        pingState,
        pingSource,
        pingResult,
        pingAnimating,
        highlightedLinkIds,
        setHighlightedLinkIds,
        resetPing,
        resetLinkSelection,
        addLinkHandler,
        pingHandler,
        handleSelectDevice,
        handleConfigureDevice,
        handleCloseConfig,
        requestConfigureLink,
        handleCloseLinkConfig,
        handlePingAnimationComplete,
        handlePingReplay,
        requestDeleteDevice,
        cancelDeleteDevice,
        confirmDeleteDevice
    };
}
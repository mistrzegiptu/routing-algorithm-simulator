import { useState, useEffect, useCallback } from 'react';
import { saveLinkRoute, updateLink, deleteLink, updateDevice, deleteDevice, exportNetwork } from "../api/device_api.js";
import { mapCordsCircular, getNewCords } from "../utils/coordsMapper.js";
import { errorParse } from "../utils/errorParser.js";

export function useTopology(canvasRef) {
    const [devices, setDevices] = useState([]);
    const [links, setLinks] = useState([]);

    useEffect(() => {
        const fetchInitData = async () => {
            try {
                const res = await exportNetwork();
    
                if (!res || !res.devices_db) return;
    
                const newDevices = mapCordsCircular(res.devices_db, canvasRef.current?.getSpawnPosition());
    
                const newLinks = res.links_db.map(l => ({
                    id: l.id,
                    sourceId: l.device_a,
                    destId: l.device_b,
                    sourcePort: l.port_a_num,
                    destPort: l.port_b_num,
                    bandwidth: l.bandwidth,
                    delay: l.delay,
                    bandwidthUnit: l.unit,
                    weight: l.weight,
                }));
    
            setDevices(newDevices);
            setLinks(newLinks);
    
            console.log("Imported devices:", newDevices);
            } catch (err) {
                console.error(err);
            }
        };
        fetchInitData();
    }, [canvasRef]);

    const importHandler = useCallback((importedDevices, importedLinks) => {
        const newDevices = mapCordsCircular(importedDevices, canvasRef.current?.getSpawnPosition());
    
        const newLinks = importedLinks.map(l => ({
            id: l.id,
            sourceId: l.device_a,
            destId: l.device_b,
            sourcePort: l.port_a_num,
            destPort: l.port_b_num,
            bandwidth: l.bandwidth,
            delay: l.delay,
            bandwidthUnit: l.unit,
        }));
    
        setDevices(newDevices);
        setLinks(newLinks);
    
        console.log("Imported links:", newLinks);
    }, [canvasRef]);

    const handleUpdateDevicePosition = useCallback((id, x, y) => {
        setDevices(prev =>
            prev.map(d => (d.id === id ? { ...d, x, y } : d))
        );
    }, []);

    const removeDevice = useCallback(async (id) => {
        try {
            const result = await deleteDevice(id);
            const removedLinkIds = result.removed_link_ids || [];
            const updatedDevices = result.updated_devices || [];
            const updatedLinks = result.updated_links || [];
        
            // Peers (routers) may have shrunk an interface; merge their fresh state.
            setDevices(prev =>
                prev.filter(d => d.id !== id)
                    .map(d => {
                        const u = updatedDevices.find(x => x.id === d.id);
                        return u ? { ...d, ...u } : d;

                    })
                );
            // Drop this device's links; sync interface indices on links that shifted.
            setLinks(prev =>
                prev.filter(l =>
                    l.sourceId !== id && l.destId !== id && !removedLinkIds.includes(l.id)
                )
                .map(l => {
                    const u = updatedLinks.find(x => x.id === l.id);
                    return u ? { ...l, sourcePort: u.port_a_num, destPort: u.port_b_num } : l;
                })
            );
        } catch(error) {
            console.error("Error deleting device:", error);
            alert("Nie udało się usunąć urządzenia.");
            throw error;
        }
    }, []);

    const saveNewLink = useCallback(async (newLinkData) => {
        try {
            const saved = await saveLinkRoute(newLinkData);
    
            // Routers may have grown a fresh interface; sync both devices' state.
            setDevices(prev =>
                prev.map(d => {
                    if (saved.device_a && d.id === saved.device_a.id) return { ...d, ...saved.device_a };
                    if (saved.device_b && d.id === saved.device_b.id) return { ...d, ...saved.device_b };
                    return d;
                })
            );
    
            setLinks(prev => [...prev, {
                id: saved.id,
                sourceId: saved.device_a_id,
                destId: saved.device_b_id,
                sourcePort: saved.port_a_num,
                destPort: saved.port_b_num,
                bandwidth: saved.bandwidth,
                delay: saved.delay,
                bandwidthUnit: saved.unit,
                weight: saved.weight,
            }]);
        } catch (error) {
            console.error("Error saving link:", error);
            alert("Nie udało się dodać połączenia.");
        }
    }, []);

    const handleSaveLinkConfig = useCallback(async (id, updatedData) => {
        try {
            const saved = await updateLink(id, updatedData);
            setLinks(prev =>
                prev.map(l => (l.id === id
                    ? { ...l, bandwidth: saved.bandwidth, delay: saved.delay, bandwidthUnit: saved.unit, weight: saved.weight }
                    : l))
            );
            setSelectedLinkId(null);
        } catch (error) {
            console.error("Error saving link:", error);
            alert("Nie udało się zapisać połączenia.");
        }
    }, []);

    const removeLink = useCallback(async (id) => {
        try {
            const result = await deleteLink(id);
            const updatedDevices = result.updated_devices || [];
            const updatedLinks = result.updated_links || [];
        
            // Peers (routers) may have shrunk an interface; merge their fresh state.
            setDevices(prev =>
                prev.map(d => {
                    const u = updatedDevices.find(x => x.id === d.id);
                    return u ? { ...d, ...u } : d;
                })
            );
            // Drop this link; sync interface indices on links that shifted.
            setLinks(prev =>
                prev.filter(l => l.id !== id)
                .map(l => {
                    const u = updatedLinks.find(x => x.id === l.id);
                    return u ? { ...l, sourcePort: u.port_a_num, destPort: u.port_b_num } : l;
                })
            );
        } catch (error) {
            console.error("Error deleting link:", error);
            alert("Nie udało się usunąć połączenia.");
            throw error;
        }   
    }, []);

    const saveDeviceConfig = useCallback(async (id, updatedData) => {
        try {
            const savedDevice = await updateDevice(id, updatedData);
            setDevices(prev =>
                prev.map(d => (d.id === id ? { ...d, ...savedDevice } : d))
            );
            setSelectedDeviceId(null);
        } catch (error) {
            alert(`Configuration save failed:\n\n${errorParse(error)}`);
        }         
    }, []);

    const handleAddDevice = (created) => {
        setDevices(prev => {
            const coords = getNewCords(prev.length, canvasRef.current?.getSpawnPosition());
            return [...prev, { ...created, ...coords }];
        });
    };

    return {
        devices,
        links,
        importHandler,
        handleUpdateDevicePosition,
        removeDevice,
        saveNewLink,
        handleSaveLinkConfig,
        removeLink,
        saveDeviceConfig,
        handleAddDevice
    };
}
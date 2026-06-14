const URL = "http://localhost:5000/api";

export async function getAvailablePort(routerId) {
    try {
        const res = await fetch(`${URL}/${routerId}/available-ports`);
        if (!res.ok) {
            throw new Error(`Failed to fetch available ports for router ${routerId}`);
        }

        const data = await res.json();
        return data.available_ports;
    } catch (err) {
        console.error("Err: ", err);
        return null;
    }
}

export async function saveLinkRoute(newLink) {
    try {
        const payloadDlaBackendu = {
            device_a_id: newLink.sourceId,
            device_b_id: newLink.destId,
            port_a_num: newLink.sourcePort,
            port_b_num: newLink.destPort,
            bandwidth: newLink.bandwidth,
            delay: newLink.delay,
            unit: newLink.bandwidthUnit
        };

        const res = await fetch(`${URL}/links`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadDlaBackendu)
        });
        if (!res.ok) {
            throw new Error(`Failed to save link route`);
        }
        const data = await res.json();
        return data;
    } catch (err) {
        console.error("Err: ", err);
        throw err;
    }
}
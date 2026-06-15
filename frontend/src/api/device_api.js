const URL = "http://localhost:5000/api";

export async function createDevice({ name, port_number, type }) {
    const payload = { type };
    if (name) payload.name = name;
    if (port_number) payload.port_number = port_number;

    const res = await fetch(`${URL}/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        throw new Error("Failed to create device");
    }
    return res.json();
}

export async function updateDevice(deviceId, updatedData) {
    const res = await fetch(`${URL}/devices/${deviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData)
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const error = new Error("Failed to update device");
        error.detail = errorData.detail;
        throw error;
    }
    return res.json();
}

export async function getAvailablePorts(deviceId) {
    try {
        const res = await fetch(`${URL}/devices/${deviceId}/available-ports`);
        if (!res.ok) {
            throw new Error(`Failed to fetch available ports for device ${deviceId}`);
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
        const payload = {
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
            body: JSON.stringify(payload)
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

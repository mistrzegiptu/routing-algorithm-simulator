const URL = "/api";

export async function createDevice({ name, type }) {
    const payload = { type };
    if (name) payload.name = name;

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

export async function deleteDevice(deviceId) {
    const res = await fetch(`${URL}/devices/${deviceId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" }
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const error = new Error("Failed to delete device");
        error.detail = errorData.detail;
        throw error;
    }
    return res.json();
}

export async function saveLinkRoute(newLink) {
    try {
        const payload = {
            device_a_id: newLink.sourceId,
            device_b_id: newLink.destId,
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

export async function deleteLink(linkId) {
    const res = await fetch(`${URL}/links/${linkId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" }
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const error = new Error("Failed to delete link");
        error.detail = errorData.detail;
        throw error;
    }
    return res.json();
}

export async function updateLink(linkId, updatedData) {
    const res = await fetch(`${URL}/links/${linkId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData)
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const error = new Error("Failed to update link");
        error.detail = errorData.detail;
        throw error;
    }
    return res.json();
}

export async function getRouteTable(id) {
    try {
        const res = await fetch(`${URL}/route/${id}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        })

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            const error = new Error("Failed to update device");
            error.detail = errorData.detail;
            throw error;
        }

        const data = await res.json();
        return data;
    } catch(err) {
        console.error("Err: ", err);
        throw err;
    }
}

export async function addRoute(id, newRoute) {
    try {
        const payload = {
            dest: newRoute.dest,
            mask: newRoute.mask,
            next_hop: newRoute.next_hop,
            entry_type: newRoute.entry_type
        };

        const res = await fetch(`${URL}/route/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            throw new Error(`Failed to add route`);
        }
        const data = await res.json();
        return data;
    } catch (err) {
        console.error("Err: ", err);
        throw err;
    }
}

export async function deleteRoute(id, toDelete) {
    try {
        const payload = {
            dest: toDelete.ip,
            mask: toDelete.mask
        };

        const res = await fetch(`${URL}/route/${id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            const error = new Error("Failed to update device");
            error.detail = errorData.detail;
            throw error;
        }

        return { success: true };
    } catch (err) {
        console.error("Err: ", err);
        throw err;
    }
}
export async function pingDevice(sourceId, targetId) {
    const res = await fetch(`${URL}/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: sourceId, target_id: targetId })
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Ping failed");
    }
    return res.json();
}

export async function exportNetwork() {
    const res = await fetch(`${URL}/export`);

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Export failed");
    }
    return res.json();
}

export async function importNetwork(fileData) {
    const res = await fetch(`${URL}/import`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(fileData)
    });

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Import failed");
    }

    return await res.json();
}
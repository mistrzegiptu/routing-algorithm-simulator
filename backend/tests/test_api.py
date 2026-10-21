"""REST handlers called directly, without an HTTP client.

Run inside Docker:
    docker compose run --rm --no-deps backend python -m pytest tests -q
"""

import asyncio

import pytest
from fastapi import HTTPException

import app as api
from modules.serialize import export_topology, import_topology
from modules.topology_store import TopologyStore
from objects.api_objects import CreateLinkRequest
from objects.computer import Computer
from objects.router import Router


def link_request(a, b):
    return CreateLinkRequest(device_a_id=a.id, device_b_id=b.id)


def test_failed_link_creation_leaves_no_orphan_interface():
    store = TopologyStore()
    router, pc = Router(id=1, name="R"), Computer(id=2, name="PC")
    store.devices += [router, pc]
    asyncio.run(api.create_link(link_request(router, pc), store))

    with pytest.raises(HTTPException) as error:
        asyncio.run(api.create_link(link_request(router, pc), store))

    assert error.value.status_code == 400
    assert len(router.ports) == router.port_number == 1


def test_device_cannot_be_linked_to_itself():
    store = TopologyStore()
    router = Router(id=1, name="R")
    store.devices.append(router)

    with pytest.raises(HTTPException) as error:
        asyncio.run(api.create_link(link_request(router, router), store))

    assert error.value.status_code == 400
    assert store.links == [] and router.ports == []


def exported_pair():
    store = TopologyStore()
    router, pc = Router(id=1, name="R"), Computer(id=2, name="PC")
    store.devices += [router, pc]
    asyncio.run(api.create_link(link_request(router, pc), store))
    return export_topology(store)


def test_import_round_trips_an_export():
    data = exported_pair()
    store = TopologyStore()

    import_topology(data, store)

    assert export_topology(store) == data
    assert (store._device_seq, store._link_seq) == (3, 2)


@pytest.mark.parametrize("corrupt", [
    lambda data: data["links_db"][0].update(device_b=99),
    lambda data: data["links_db"][0].update(port_a_num=5),
    lambda data: data["devices_db"][1]["ports"][0].update(ip=data["devices_db"][0]["ports"][0]["ip"]),
    lambda data: data["devices_db"][0].update(type="switch"),
])
def test_rejected_import_keeps_the_current_topology(corrupt):
    store = TopologyStore()
    import_topology(exported_pair(), store)
    before = export_topology(store)

    data = exported_pair()
    data["devices_db"][0]["name"] = "Other"
    corrupt(data)
    with pytest.raises(ValueError):
        import_topology(data, store)

    assert export_topology(store) == before

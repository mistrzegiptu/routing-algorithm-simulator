from objects.router import Router
from objects.computer import Computer
from objects.device import Device
from pydantic import BaseModel, ConfigDict
from objects.route_entry import RouteType
from objects.link import Link
from typing import Literal

class PortModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    ip: str
    mask: int

class LinkModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    device_a: int
    device_b: int
    port_a_num: int
    port_b_num: int
    bandwidth: int
    delay: int
    unit: str

class RoutingTableEntryModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    dest: str
    mask: int
    next_hop: str
    entry_type: RouteType

DeviceType = Literal["router", "computer"]

class DeviceModel(BaseModel):
    type: DeviceType
    model_config = ConfigDict(from_attributes=True)
    name: str
    port_number: int
    ports: list[PortModel]
    id: int
    routing_table: list[RoutingTableEntryModel]

class ExportedModel(BaseModel):
    devices_db: list[DeviceModel]
    links_db: list[LinkModel]


def import_topology(json_content, store):
    store.devices.clear()
    store.links.clear()
    store.ip_pool.clear()

    topology = ExportedModel.model_validate(json_content)

    max_device_id = 0
    max_link_id = 0

    for device in topology.devices_db:
        if device.type == "router":
            new_device = Router(id=device.id, name=device.name, port_number=0)
        else:
            new_device = Computer(id=device.id, name=device.name, port_number=0)

        for port in device.ports:
            new_device.add_port(port.ip, port.mask)
            store.reserve_ip(port.ip)

        for route in device.routing_table:
            new_device.add_route(device_ip=route.dest, mask=route.mask, next_hop=route.next_hop, route_type=route.entry_type)

        if new_device.id > max_device_id:
            max_device_id = new_device.id

        store.devices.append(new_device)

    for link in topology.links_db:
        new_link = Link(id=link.id, device_a=link.device_a, device_b=link.device_b, port_a_num=link.port_a_num, port_b_num=link.port_b_num, bandwidth=link.bandwidth, delay=link.delay, unit=link.unit)

        if new_link.id > max_link_id:
            max_link_id = new_link.id

        store.links.append(new_link)

        dev_a = next((d for d in store.devices if d.id == link.device_a), None)
        dev_b = next((d for d in store.devices if d.id == link.device_b), None)

        if dev_a is not None and dev_b is not None:
            dev_a.links.append(new_link)
            dev_b.links.append(new_link)

    store._device_seq = max_device_id + 1
    store._link_seq = max_link_id + 1

def export_topology(store):
    devices = []
    for device in store.devices:
        device_type = "router" if isinstance(device, Router) else "computer"

        device_data = {
            "type": device_type,
            "name": device.name,
            "port_number": device.port_number,
            "ports": device.ports,
            "id": device.id,
            "routing_table": device.routing_table
        }

        device_model = DeviceModel.model_validate(device_data)
        devices.append(device_model)

    links = [LinkModel.model_validate(link) for link in store.links]

    return ExportedModel(devices_db=devices, links_db=links).model_dump()

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
    bandwidth: int | None = None
    delay: int
    unit: str
    weight: int = 1

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
    topology = ExportedModel.model_validate(json_content)

    devices = {}
    used_ips = set()
    for device in topology.devices_db:
        if device.id in devices:
            raise ValueError(f"Device id {device.id} is used more than once")
        if device.type == "router":
            new_device = Router(id=device.id, name=device.name, port_number=0)
        else:
            new_device = Computer(id=device.id, name=device.name, port_number=0)

        for port in device.ports:
            if port.ip in used_ips:
                raise ValueError(f"IP address {port.ip} is already in use")
            used_ips.add(port.ip)
            new_device.add_port(port.ip, port.mask)

        for route in device.routing_table:
            new_device.add_route(device_ip=route.dest, mask=route.mask, next_hop=route.next_hop, route_type=route.entry_type)

        devices[new_device.id] = new_device

    links = {}
    used_ports = set()
    for link in topology.links_db:
        dev_a = devices.get(link.device_a)
        dev_b = devices.get(link.device_b)
        if dev_a is None or dev_b is None or dev_a is dev_b:
            raise ValueError(f"Link {link.id} must connect two existing devices")
        if link.id in links:
            raise ValueError(f"Link id {link.id} is used more than once")
        for device, port_num in ((dev_a, link.port_a_num), (dev_b, link.port_b_num)):
            if not 0 <= port_num < len(device.ports) or (device.id, port_num) in used_ports:
                raise ValueError(f"Link {link.id} uses a missing or already connected interface of {device.name}")
            used_ports.add((device.id, port_num))

        new_link = Link(
            id=link.id,
            device_a=link.device_a,
            device_b=link.device_b,
            port_a_num=link.port_a_num,
            port_b_num=link.port_b_num,
            bandwidth=link.bandwidth,
            delay=link.delay,
            unit=link.unit,
            weight=link.weight,
        )
        dev_a.links.append(new_link)
        dev_b.links.append(new_link)
        links[new_link.id] = new_link

    store.devices[:] = devices.values()
    store.links[:] = links.values()
    store.ip_pool.clear()
    store.ip_pool.update(used_ips)
    store._device_seq = max(devices, default=0) + 1
    store._link_seq = max(links, default=0) + 1

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

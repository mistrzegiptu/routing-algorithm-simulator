from .device import Device

class Router(Device):
    dynamic_ports = True

    def __init__(self, name = None, port_number = 0):
        super().__init__(name, port_number)

if __name__ == "__main__":
    r1 = Router(port_number = 5)
    r2 = Router(name = "Kaszanka", port_number = 3)

    print("Initial Routers")
    print(r1.name, r1.port_number, [(p.ip, p.mask) for p in r1.ports])
    print(r2.name, r2.port_number, [(p.ip, p.mask) for p in r2.ports])
    print("Used IPs:", Device.ip_address_pool)

    print("\nAdding Ports")
    new_port1 = r1.add_port(ip = "192.168.11.10", mask = 28)
    new_port2 = r2.add_port()
    print(f"Added to {r1.name}: {new_port1}")
    print(f"Added to {r2.name}: {new_port2}")
    print(r1.port_number, r2.port_number)
    print(r1.ports)
    print(r2.ports)
    print("Used IPs:", Device.ip_address_pool)

    print("\nEditing Ports")
    r1.edit_port(new_port1, new_ip = "192.168.11.20", new_mask = 30)
    r2.edit_port(r2.ports[0], new_mask=26)
    print(f"{r1.name} port edited:", new_port1)
    print(f"{r2.name} port 0 edited:", r2.ports[0])
    print("Used IPs:", Device.ip_address_pool)

    print("\nRemoving Ports")
    removed_port = r1.del_port(r1.ports[0])
    print(f"Removed from {r1.name}:", removed_port)
    print(r1.ports)
    print("Used IPs:", Device.ip_address_pool)
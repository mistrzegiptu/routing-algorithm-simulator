from port import Port

def ip_generator():
    first_part = 0
    second_part = 1

    while True:
        ip = f"128.0.{first_part}.{second_part}"
        Device.ip_address_pool.add(ip)
        yield Port(ip, 24)

        second_part += 1
        if second_part == 256:
            second_part = 1
            first_part += 1

class Device:
    _counter = 0
    ip_address_pool = set()
    ip_gen = ip_generator()

    def __init__(self, name = None, port_number = 1):
        class_name = self.__class__.__name__
        self.name = f"{class_name}_{Device._counter}" if name is None else name
        self.port_number = port_number
        self.ports = [next(Device.ip_gen) for _ in range(port_number)]

        Device._counter += 1

    def add_port(self, ip = None, mask = 24):
        if ip is None:
            new_port = next(Device.ip_gen)
            if mask != 24:
                new_port.set_mask(mask)
        else:
            if ip in Device.ip_address_pool:
                raise ValueError("IP address already in use")
            new_port = Port(ip, mask)
            Device.ip_address_pool.add(new_port.ip)
        self.ports.append(new_port)
        self.port_number += 1
        return new_port

    def edit_port(self, port, new_ip = None, new_mask = None):
        if port not in self.ports:
            raise ValueError("Port does not exist")
        if new_ip is not None:
            if new_ip in Device.ip_address_pool:
                raise ValueError("Ip address already in use")
            Device.ip_address_pool.add(new_ip)
            Device.ip_address_pool.remove(port.ip)
            port.set_ip(new_ip)
        if new_mask is not None:
            port.set_mask(new_mask)
        return port

    def del_port(self, port):
        if port not in self.ports:
            raise ValueError("Port does not exist")
        self.ports.remove(port)
        self.port_number -= 1
        Device.ip_address_pool.remove(port.ip)
        return port







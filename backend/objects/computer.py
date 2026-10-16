from .device import Device

class Computer(Device):
    def __init__(self, id, name = None, port_number = 1, used_ips = ()):
        super().__init__(id, name, port_number, used_ips)
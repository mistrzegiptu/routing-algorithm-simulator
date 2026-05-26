from .device import Device

class Computer(Device):
    def __init__(self, name = None, port_number = 1):
        super().__init__(name, port_number)
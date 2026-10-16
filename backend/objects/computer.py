from .device import Device

class Computer(Device):
    def __init__(self, id, name = None, **kwargs):
        super().__init__(id, name, 1)
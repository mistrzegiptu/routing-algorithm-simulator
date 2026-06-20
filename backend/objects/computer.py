from .device import Device

class Computer(Device):
    def __init__(self, name = None, **kwargs):
        super().__init__(name, 1)
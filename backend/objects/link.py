from dataclasses import dataclass, field

@dataclass
class Link:
    _counter = 0

    id: int = field(init=False)

    device_a: int
    device_b: int
    port_a_num: int
    port_b_num: int

    bandwidth: int
    delay: int
    unit: str
    weight: int = 1

    def __post_init__(self):
        self.id = Link._counter
        Link._counter += 1

    def set_device_a(self, device_a: int):
        self.device_a = device_a

    def set_device_b(self, device_b: int):
        self.device_b = device_b

    def set_port_a_num(self, port_a_num: int):
        self.port_a_num = port_a_num

    def set_port_b_num(self, port_b_num: int):
        self.port_b_num = port_b_num

    def set_bandwidth(self, bandwidth: int):
        self.bandwidth = bandwidth

    def set_delay(self, delay: int):
        self.delay = delay

    def set_unit(self, unit: str):
        self.unit = unit

    def set_weight(self, weight: int):
        self.weight = weight
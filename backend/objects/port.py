from dataclasses import dataclass, field

@dataclass
class Port:
    ip: str
    mask: int

    def set_ip(self,ip):
        self.ip = ip

    def set_mask(self,mask):
        self.mask = mask
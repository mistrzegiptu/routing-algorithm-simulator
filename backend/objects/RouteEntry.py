from dataclasses import dataclass

@dataclass
class RouteEntry:
    dest: str
    mask: str
    next_hop: str
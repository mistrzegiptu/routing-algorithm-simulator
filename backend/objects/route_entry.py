from dataclasses import dataclass

@dataclass
class RouteEntry:
    dest: str
    mask: int
    next_hop: str
    entry_type: str 
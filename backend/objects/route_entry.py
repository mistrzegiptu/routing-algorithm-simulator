from dataclasses import dataclass
from typing import Literal

RouteType = Literal["connected", "static"]

@dataclass
class RouteEntry:
    dest: str
    mask: int
    next_hop: str
    entry_type: RouteType
from dataclasses import dataclass, field
from pydantic import BaseModel
from typing import Optional

@dataclass
class SimConfig:
    seed: int | None = None
    ttl: int = 64
    # Runaway guard (buggy flooding, endless control storms). TTL bounds each
    # individual packet; this bounds the whole session.
    max_events: int = 50_000


@dataclass
class Timer:
    """Passed back to RoutingAlgorithm.on_timer when a scheduled timer fires."""
    node_id: int
    name: str
    payload: dict = field(default_factory=dict)

class SimulationCommand(BaseModel):
    action: str
    algorithm: Optional[str] = None
    speed: Optional[float] = None
    seed: Optional[int] = None
    source_id: Optional[int] = None
    target_id: Optional[int] = None
    options: Optional[dict] = None
    skip_idle: Optional[bool] = None
import asyncio

MIN_SPEED, MAX_SPEED = 0.01, 100.0

class SimulationClock:
    def __init__(self, speed: float = 1.0):
        self.state = "idle"
        self.speed = 1.0
        self._sim_at_anchor = 0.0
        self._wall_anchor = None

    def anchor(self, sim_t):
        self._sim_at_anchor = sim_t
        self._wall_anchor = asyncio.get_running_loop().time()
    
    def sim_now(self):
        if self._wall_anchor is None:
            return self._sim_at_anchor
        elapsed = asyncio.get_running_loop().time() - self._wall_anchor
        return self._sim_at_anchor + elapsed * self.speed * 1000.0

    def pause(self):
        if self.state == "running":
            self._sim_at_anchor = self.sim_now()
            self._wall_anchor = None
            self.state = "paused"

    def resume(self):
        if self.state == "paused":
            self.anchor(self._sim_at_anchor)
            self.state = "running"

    def set_speed(self, speed: float):
        try:
            speed = float(speed)
        except (TypeError, ValueError):
            return

        current = self.sim_now()
        self.speed = max(MIN_SPEED, min(MAX_SPEED, speed))

        if self.state == "running":
            self.anchor(current)
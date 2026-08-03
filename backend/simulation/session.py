import asyncio

from .packet import Packet
from fastapi import WebSocketDisconnect

from .engine import SimConfig, SimulationEngine
from .registry import ALGORITHMS, get_algorithm
from .snapshot import NetworkSnapshot
from .events import KIND_DATA

MIN_SPEED, MAX_SPEED = 0.01, 100.0


class SimulationSession:
    """One WebSocket connection = one live simulation world (design doc §8).

    The engine is a passive state machine; this session gives it a clock.
    Simulation time flows continuously with wall time × speed (also while the
    queue is idle), so a ping injected 10 s after start lands at t ≈ 10 s.
    The run task sleeps until the next event is due — or until the client
    sends a command (ping/pause/step/speed/stop) through the command queue.
    """

    def __init__(self, websocket, devices_db, links_db):
        self.ws = websocket
        self.devices_db = devices_db
        self.links_db = links_db

        self.state = "idle"      # idle | running | paused | finished | error
        self.speed = 1.0
        self._engine = None
        self._task = None
        self._commands = None    # asyncio.Queue, fresh per run

        self._send_lock = asyncio.Lock()
        # Sim-clock anchor: sim_now = _sim_at_anchor (+ elapsed wall × speed
        # while running). _wall_anchor is None while paused (clock frozen).
        self._sim_at_anchor = 0.0
        self._wall_anchor = None

    # ------------------------------------------------------------- lifecycle
    async def handle(self):
        await self.ws.accept()
        await self._send_status()
        try:
            while True:
                msg = await self.ws.receive_json()
                await self._dispatch(msg)
        except WebSocketDisconnect:
            pass
        finally:
            await self._cancel_run()

    async def _dispatch(self, msg):
        action = (msg or {}).get("action")
        run_active = self._task is not None and not self._task.done()

        if action == "start":
            await self._start(msg)
        elif action == "set_speed" and not run_active:
            # Remember the preference for the next run.
            self.speed = self._clamp_speed(msg.get("speed"))
            await self._send_status()
        elif action in ("pause", "resume", "step", "ping", "set_speed", "stop"):
            if run_active:
                await self._commands.put(msg)
            elif action == "stop":
                self.state = "idle"
                await self._send_status()
            else:
                await self._send_error("Symulacja nie działa — najpierw ją uruchom")
        else:
            await self._send_error(f"Nieznana akcja: {action!r}")

    async def _start(self, msg):
        await self._cancel_run()

        name = msg.get("algorithm")
        if name not in ALGORITHMS:
            return await self._send_error(f"Nieznany algorytm: {name!r}")
        if not self.devices_db:
            return await self._send_error("Brak urządzeń — zbuduj najpierw topologię")
        if "speed" in msg:
            self.speed = self._clamp_speed(msg.get("speed"))

        # Snapshot here = the simulation is a pure function of the topology as
        # it was at start; later edits on the Build screen don't leak in.
        snapshot = NetworkSnapshot.from_db(self.devices_db, self.links_db)
        config = SimConfig(seed=msg.get("seed"))
        self._engine = SimulationEngine(snapshot, get_algorithm(name), config)
        self._commands = asyncio.Queue()

        self.state = "running"
        await self._send_status()
        self._task = asyncio.create_task(self._run())

    # ---------------------------------------------------------- run task
    async def _run(self):
        engine = self._engine
        try:
            await self._send_events(engine.start())
            self._anchor(0.0)

            while True:
                if engine.limit_hit:
                    self.state = "finished"
                    await self._send({"type": "finished", "reason": engine.limit_hit,
                                      **engine.summary()})
                    await self._send_status()
                    return

                if self.state == "paused":
                    if not await self._apply(await self._commands.get()):
                        return
                    continue

                t_next = engine.peek_time()
                if t_next is None:
                    # World is idle — only a client command can wake it up.
                    if not await self._apply(await self._commands.get()):
                        return
                    continue

                wall_wait = (t_next - self._sim_now()) / self.speed / 1000.0
                if wall_wait > 0:
                    try:
                        cmd = await asyncio.wait_for(self._commands.get(), timeout=wall_wait)
                    except asyncio.TimeoutError:
                        pass
                    else:
                        if not await self._apply(cmd):
                            return
                        continue

                await self._send_events(engine.advance())
        except asyncio.CancelledError:
            raise
        except Exception as e:  # algorithm/engine failure → surface, keep the socket
            self.state = "error"
            try:
                await self._send_error(str(e))
                await self._send_status()
            except Exception:
                pass

    async def _apply(self, cmd):
        """Handle one client command inside the run task. False = end the run."""
        action = cmd.get("action")

        if action == "pause" and self.state == "running":
            self._sim_at_anchor = self._sim_now()
            self._wall_anchor = None
            self.state = "paused"
            await self._send_status()

        elif action == "resume" and self.state == "paused":
            self.state = "running"
            self._anchor(self._sim_at_anchor)
            await self._send_status()

        elif action == "step" and self.state == "paused":
            t_next = self._engine.peek_time()
            if t_next is not None:
                # Jump the frozen clock to the event we're forcing through.
                self._sim_at_anchor = max(self._sim_at_anchor, t_next)
                await self._send_events(self._engine.advance())

        elif action == "set_speed":
            current = self._sim_now()
            self.speed = self._clamp_speed(cmd.get("speed"))
            if self.state == "running":
                self._anchor(current)
            await self._send_status()

        elif action == "ping":
            await self._inject_ping(cmd)

        elif action == "stop":
            self.state = "idle"
            await self._send({"type": "finished", "reason": "stopped",
                              **self._engine.summary()})
            await self._send_status()
            return False

        return True

    async def _inject_ping(self, cmd):
        engine = self._engine
        try:
            source_id = int(cmd["source_id"])
            target_id = int(cmd["target_id"])
        except (KeyError, TypeError, ValueError):
            return await self._send_error("Ping wymaga pól source_id i target_id")

        target_ip = engine.snapshot.first_ip(target_id)

        # Validate against the snapshot — devices added after start don't exist
        # in this world.
        if engine.snapshot.node(source_id) is None or engine.snapshot.node(target_id) is None:
            return await self._send_error("Urządzenie spoza uruchomionej symulacji")
        if source_id == target_id:
            return await self._send_error("Źródło i cel pingu muszą być różne")

        packet = Packet(
            engine._next_packet_id(),
            kind=KIND_DATA,
            protocol="icmp",
            src_id=source_id,
            dst_id=target_id,
            dst_ip=target_ip,
            ttl=engine.config.ttl,
            meta={"icmp": "request", "created_t": self._sim_now()}
        )

        packet_id = engine.inject_packet(source_id, self._sim_now(), packet)
        await self._send({
            "type": "ping_sent",
            "packet_id": packet_id,
            "source_id": source_id,
            "target_id": target_id,
        })

    # ------------------------------------------------------------ sim clock
    def _anchor(self, sim_t):
        self._sim_at_anchor = sim_t
        self._wall_anchor = asyncio.get_running_loop().time()

    def _sim_now(self):
        if self._wall_anchor is None:
            return self._sim_at_anchor
        elapsed = asyncio.get_running_loop().time() - self._wall_anchor
        return self._sim_at_anchor + elapsed * self.speed * 1000.0

    @staticmethod
    def _clamp_speed(value):
        try:
            speed = float(value)
        except (TypeError, ValueError):
            return 1.0
        return min(MAX_SPEED, max(MIN_SPEED, speed))

    # ------------------------------------------------------------------ send
    async def _cancel_run(self):
        task, self._task = self._task, None
        if task and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        self._engine = None

    async def _send_events(self, events):
        for event in events:
            await self._send({"type": "sim_event", "event": event.to_dict()})

    async def _send(self, payload):
        async with self._send_lock:
            await self.ws.send_json(payload)

    async def _send_status(self):
        await self._send({"type": "status", "state": self.state, "speed": self.speed})

    async def _send_error(self, message):
        await self._send({"type": "error", "message": message})

import asyncio
from fastapi import WebSocketDisconnect
from pydantic import ValidationError

from .models import SimulationCommand
from .clock import SimulationClock
from .handler import CommandHandler
from .snapshot import NetworkSnapshot

IDLE_SKIP_WALL = 0.25

class SimulationSession:
    def __init__(self, websocket, store):
        self.ws = websocket
        self.store = store
        
        self.clock = SimulationClock()
        self.handler = CommandHandler(self)
        self.engine = None
        self.skip_idle = True

        self._task = None
        self._send_lock = asyncio.Lock()
        self._wake_event = asyncio.Event()

    async def handle(self):
        await self.ws.accept()
        await self.send_status()
        try:
            while True:
                raw_msg = await self.ws.receive_json()
                try:
                    # Walidacja przychodzących danych przez Pydantic
                    cmd = SimulationCommand.model_validate(raw_msg)
                    # Przekazanie bezpiecznego obiektu do naszego nowego handlera
                    await self.handler.handle(cmd)
                except ValidationError as e:
                    await self.send_error(f"Błąd komendy: {str(e)}")
        except WebSocketDisconnect:
            pass
        finally:
            self._cancel_run()

    def start_run_loop(self):
        self._cancel_run()
        self._task = asyncio.create_task(self._run())

    def _cancel_run(self):
        if self._task and not self._task.done():
            self._task.cancel()
            self._task = None

    async def _run(self):
        """Pętla napędzająca czas."""
        try:
            while self.clock.state in ("running", "paused"):
                self._wake_event.clear()
                if self.engine.limit_hit:
                    self.clock.state = "finished"
                    await self.send({"type": "finished", "reason": self.engine.limit_hit, **self.engine.summary()})
                    await self.send_status()
                    return

                t_next = self.engine.peek_time()
                
                # Jeśli pauza lub brak zdarzeń - uśpij mocno, czeka na komendę
                if self.clock.state == "paused" or t_next is None:
                    await self._wake_event.wait()
                    continue

                wall_wait = (t_next - self.clock.sim_now()) / self.clock.speed / 1000.0

                if wall_wait > 0:
                    skip = (
                        self.skip_idle
                        and wall_wait > IDLE_SKIP_WALL
                        and not self.engine.has_traffic()
                    )
                    try:
                        await asyncio.wait_for(
                            self._wake_event.wait(),
                            timeout=IDLE_SKIP_WALL if skip else wall_wait
                        )
                    except TimeoutError:
                        if skip and self.clock.state == "running":
                            self.clock.anchor(t_next)
                    continue

                await self.send_events(self.engine.advance())

        except asyncio.CancelledError:
            pass
        except Exception as e:
            self.clock.state = "error"
            await self.send_error(str(e))
            await self.send_status()

    # --- Metody wysyłania komunikatów do klienta ---
    async def send_events(self, events):
        for event in events:
            await self.send({"type": "sim_event", "event": event.to_dict()})

    async def send(self, payload):
        async with self._send_lock:
            await self.ws.send_json(payload)

    async def send_status(self):
        # Pobieramy stan i prędkość z naszego nowego obiektu Clock
        await self.send({"type": "status", "state": self.clock.state, "speed": self.clock.speed})

    async def send_error(self, message):
        await self.send({"type": "error", "message": message})

    async def sync_topology(self):
        if self.engine is None or self.clock.state not in ("running", "paused"):
            return
        snapshot = NetworkSnapshot.from_db(self.store.devices, self.store.links)
        try:
            events = self.engine.apply_topology(snapshot, at=self.clock.sim_now())
        except Exception as e:
            self._cancel_run()
            self.clock.state = "error"
            await self.send_error(str(e))
            await self.send_status()
            return
        self._wake_event.set()
        await self.send_events(events)
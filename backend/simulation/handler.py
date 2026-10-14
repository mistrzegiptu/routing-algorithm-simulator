from .models import SimulationCommand
from .engine import SimulationEngine, SimConfig
from .registry import ALGORITHMS, get_algorithm
from .snapshot import NetworkSnapshot
from .packet import Packet

class CommandHandler:
    def __init__(self, session):
        self.session = session

    async def handle(self, command):
        action = command.action

        if action == "start":
            await self._start(command)
        elif action == "pause":
            self.session.clock.pause()
            await self.session.send_status()
        elif action == "resume":
            self.session.clock.resume()
            await self.session.send_status()
        elif action == "step":
            await self._step()
        elif action == "set_speed":
            if command.speed is not None:
                self.session.clock.set_speed(command.speed)
                await self.session.send_status()
        elif action == "ping":
            await self._inject_ping(command)
        elif action == "stop":
            self.session.clock.state = "idle"
            if self.session.engine:
                await self.session.send({"type": "finished", "reason": "stopped", **self.session.engine.summary()})
            await self.session.send_status()

    async def _start(self, command):
        if command.algorithm not in ALGORITHMS:
            return await self.session.send_error(f"Nieznany algorytm: {command.algorithm}")
        if not self.session.store.devices:
            return await self.session.send_error("Brak urządzeń — zbuduj najpierw topologię")

        if command.speed is not None:
            self.session.clock.set_speed(command.speed)

        snapshot = NetworkSnapshot.from_db(self.session.store.devices, self.session.store.links)
        config = SimConfig(seed=command.seed)

        self.session.engine = SimulationEngine(snapshot, get_algorithm(command.algorithm), config)
        self.session.clock.state = "running"

        await self.session.send_status()
        self.session.start_run_loop()

    async def _step(self):
        if self.session.clock.state == "paused" and self.session.engine:
            t_next = self.session.engine.peek_time()
            if t_next is not None:
                self.session.clock._sim_at_anchor = max(self.session.clock._sim_at_anchor, t_next)
                await self.session.send_events(self.session.engine.advance())

    async def _inject_ping(self, command):
        if command.source_id is None or command.target_id is None:
            return await self.session.send_error("Ping wymaga podania source_id i target_id")

        engine = self.session.engine
        if not engine:
            return await self.session.send_error("Symulacja nie jest uruchomiona")

        target_ip = engine.snapshot.first_ip(command.target_id)

        if engine.snapshot.node(command.source_id) is None or engine.snapshot.node(command.target_id) is None:
            return await self.session.send_error(f"Nieznane urządzenie")

        packet = Packet.create_ping_packet(
            packet_id=engine._next_packet_id(),
            src_id=command.source_id,
            dst_id=command.target_id,
            dst_ip=target_ip,
            ttl=engine.config.ttl,
            time=self.session.clock.sim_now()
        )

        packet_id = engine.inject_packet(packet.src_id, self.session.clock.sim_now(), packet)
        await self.session.send({
            "type": "ping_sent", "packet_id": packet_id,
            "source_id": command.source_id, "target_id": command.target_id,
        })

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
            self.session._wake_event.set()
            await self.session.send_status()
        elif action == "resume":
            self.session.clock.resume()
            self.session._wake_event.set()
            await self.session.send_status()
        elif action == "step":
            await self._step()
        elif action == "set_speed":
            if command.speed is not None:
                self.session.clock.set_speed(command.speed)
                self.session._wake_event.set()
                await self.session.send_status()
        elif action == "set_skip_idle":
            if command.skip_idle is not None:
                self.session.skip_idle = command.skip_idle
                self.session._wake_event.set()
        elif action == "ping":
            await self._inject_ping(command)
        elif action == "stop":
            self.session.clock.state = "idle"
            self.session._wake_event.set()
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
        if command.skip_idle is not None:
            self.session.skip_idle = command.skip_idle

        snapshot = NetworkSnapshot.from_db(self.session.store.devices, self.session.store.links)
        algorithm = get_algorithm(command.algorithm, command.options)
        config = SimConfig(seed=command.seed)
        if algorithm.max_events:
            config.max_events = algorithm.max_events

        self.session._cancel_run()
        engine = SimulationEngine(snapshot, algorithm, config)
        try:
            start_events = engine.start()
        except Exception as e:
            self.session.clock.state = "error"
            await self.session.send_error(str(e))
            return await self.session.send_status()

        self.session.engine = engine
        self.session.clock.anchor(0.0)
        self.session.clock.state = "running"

        await self.session.send_status()
        await self.session.send_events(start_events)
        self.session.start_run_loop()

    async def _step(self):
        if self.session.clock.state == "paused" and self.session.engine:
            t_next = self.session.engine.peek_time()
            if t_next is not None:
                self.session.clock._sim_at_anchor = max(self.session.clock._sim_at_anchor, t_next)
                await self.session.send_events(self.session.engine.advance())

    async def _inject_ping(self, command):
        if not command.source_ip or not command.target_ip:
            return await self.session.send_error("Ping wymaga podania source_ip i target_ip")

        engine = self.session.engine
        if not engine:
            return await self.session.send_error("Symulacja nie jest uruchomiona")

        source = engine.snapshot.find_by_ip(command.source_ip)
        target = engine.snapshot.find_by_ip(command.target_ip)

        if source is None:
            return await self.session.send_error(
                f"Nie znaleziono urządzenia z IP {command.source_ip}"
            )
        if target is None:
            return await self.session.send_error(
                f"Nie znaleziono urządzenia z IP {command.target_ip}"
            )

        now = max(engine.now, self.session.clock.sim_now())
        packet = Packet.create_ping_packet(
            packet_id=engine._next_packet_id(),
            src_id=source.id,
            dst_id=target.id,
            dst_ip=command.target_ip,
            ttl=engine.config.ttl,
            time=now
        )

        packet.meta["source_ip"] = command.source_ip
        packet_id = engine.inject_packet(source.id, now, packet)
        self.session._wake_event.set()
        await self.session.send({
            "type": "ping_sent", "packet_id": packet_id,
            "source_ip": command.source_ip, "target_ip": command.target_ip,
        })

"""Topology edits made while a simulation runs (SimulationEngine.apply_topology).

Run inside Docker:
    docker compose run --rm --no-deps backend python -m pytest tests -q
"""

import asyncio

from modules.topology_store import TopologyStore
from objects.computer import Computer
from objects.router import Router
from simulation.algorithm import RoutingAlgorithm
from simulation.engine import SimConfig, SimulationEngine
from simulation.packet import Packet
from simulation.registry import get_algorithm
from simulation.session import SimulationSession
from simulation.snapshot import NetworkSnapshot


class FirstNeighbor(RoutingAlgorithm):
    name = "first_neighbor_dynamic_test"

    def on_packet(self, ctx, node, packet):
        options = ctx.net.neighbors(node.id)
        prev = packet.meta.get("prev_node")
        candidates = [a for a in options if a.neighbor_id != prev] or options
        if not candidates:
            return ctx.drop(node, packet, "dead_end")
        ctx.forward(node, packet, candidates[0])


class Recorder(FirstNeighbor):
    name = "recorder_dynamic_test"

    def __init__(self, options=None):
        super().__init__(options)
        self.calls = []

    def on_init(self, ctx):
        for node in ctx.net.nodes.values():
            ctx.state(node)["booted"] = True
            ctx.schedule_timer(node, 1_000, "tick")

    def on_node_added(self, ctx, node):
        self.calls.append(("added", node.id, ctx.net.node(node.id) is node))

    def on_node_removed(self, ctx, node):
        self.calls.append(("removed", node.id, ctx.net.node(node.id) is None, ctx.state(node).get("booted")))

    def on_link_up(self, ctx, link):
        self.calls.append(("up", link.id, link.id in ctx.net.links))

    def on_link_down(self, ctx, link):
        self.calls.append(("down", link.id, link.id in ctx.net.links))


def connect(a, b, delay=10):
    return a.add_link(b, a.allocate_link_port(), b.allocate_link_port(), 100, delay, "Mbps")


def start(devices, links, algorithm):
    engine = SimulationEngine(NetworkSnapshot.from_db(devices, links), algorithm, SimConfig(seed=1))
    engine.start()
    return engine


def resync(engine, devices, links, at=None):
    return engine.apply_topology(NetworkSnapshot.from_db(devices, links), at=engine.now if at is None else at)


def ping(engine, source, target, at):
    packet = Packet.create_ping_packet(
        packet_id=f"ping-{at}", src_id=source.id, dst_id=target.id,
        dst_ip=engine.snapshot.first_ip(target.id), ttl=64, time=at,
    )
    engine.inject_packet(source.id, at, packet)


def drain(engine):
    events = []
    while engine.peek_time() is not None:
        events += engine.advance()
    return events


def changes(events):
    return [
        (e.payload["change"], e.link_id if e.link_id is not None else e.node_id)
        for e in events if e.type == "topology_change"
    ]


def delivered(events):
    return [e.payload.get("icmp") for e in events if e.type == "packet_delivered"]


def line():
    pc1, r1, pc2 = Computer(id=1, name="PC1"), Router(id=2, name="R1"), Computer(id=3, name="PC2")
    return [pc1, r1, pc2], [connect(pc1, r1, 10), connect(r1, pc2, 5)]


def test_removing_a_link_drops_its_packets_in_flight():
    devices, links = line()
    pc1, _, pc2 = devices
    engine = start(devices, links, FirstNeighbor())
    ping(engine, pc1, pc2, at=0.0)
    engine.advance()
    assert engine.has_traffic()

    events = resync(engine, devices, [links[1]], at=4.0)

    drops = [(e.link_id, e.payload["reason"]) for e in events if e.type == "packet_dropped"]
    assert drops == [(links[0].id, "link_disconnected")]
    assert changes(events) == [("link_down", links[0].id)]
    assert engine.now == 4.0
    assert not engine.has_traffic()
    assert engine.peek_time() is None


def test_link_added_mid_run_carries_traffic():
    pc1, r1, r2, pc2 = Computer(id=1, name="PC1"), Router(id=2, name="R1"), Router(id=3, name="R2"), Computer(id=4, name="PC2")
    devices = [pc1, r1, r2, pc2]
    links = [connect(pc1, r1), connect(r2, pc2)]
    engine = start(devices, links, get_algorithm("flooding"))
    ping(engine, pc1, pc2, at=0.0)
    assert delivered(drain(engine)) == []

    links.append(connect(r1, r2, 7))
    assert changes(resync(engine, devices, links)) == [("link_up", links[-1].id)]

    ping(engine, pc1, pc2, at=engine.now + 1)
    assert delivered(drain(engine)) == ["request", "reply"]


def test_link_delay_change_applies_to_later_transmissions():
    devices, links = line()
    pc1, _, pc2 = devices
    engine = start(devices, links, FirstNeighbor())

    links[0].set_delay(40)
    events = resync(engine, devices, links)
    change = next(e for e in events if e.type == "topology_change")
    assert change.payload["change"] == "link_changed"
    assert (change.payload["before"]["delay"], change.payload["after"]["delay"]) == (10, 40)

    ping(engine, pc1, pc2, at=0.0)
    events = drain(engine)
    sent = [e for e in events if e.type == "packet_sent" and e.link_id == links[0].id]
    assert sent and all(e.payload["delay"] == 40 for e in sent)
    assert events[-1].payload["rtt"] == 90


def test_reindexed_interfaces_are_not_reported_as_link_flaps():
    router = Router(id=1, name="R")
    hosts = [Computer(id=i, name=f"PC{i}") for i in (2, 3, 4)]
    links = [connect(router, host) for host in hosts]
    devices = [router, *hosts]
    engine = start(devices, links, FirstNeighbor())

    gone = links.pop(0)
    router.del_link(gone.id, hosts[0])
    router.remove_link_port(gone.port_a_num)
    events = resync(engine, devices, links)

    assert changes(events) == [("link_down", gone.id)]
    assert [adj.local_port for adj in engine.snapshot.neighbors(router.id)] == [0, 1]


def test_readdressed_interface_brings_its_link_down_and_up():
    r1, r2 = Router(id=1, name="R1"), Router(id=2, name="R2")
    links = [connect(r1, r2)]
    engine = start([r1, r2], links, FirstNeighbor())

    r1.edit_port(r1.ports[0], new_ip="10.9.9.1", new_mask=30)
    events = resync(engine, [r1, r2], links)

    assert changes(events) == [("link_down", links[0].id), ("link_up", links[0].id)]


def test_removed_device_takes_its_links_timers_and_state_with_it():
    devices, links = line()
    pc1, r1, pc2 = devices
    algorithm = Recorder()
    engine = start(devices, links, algorithm)

    events = resync(engine, [pc1, pc2], [])

    assert changes(events) == [("link_down", links[0].id), ("link_down", links[1].id), ("node_removed", r1.id)]
    assert algorithm.calls == [
        ("down", links[0].id, False),
        ("down", links[1].id, False),
        ("removed", r1.id, True, True),
    ]
    assert r1.id not in engine._algo_state
    assert sorted(entry.node_id for _, _, entry in engine._queue) == [pc1.id, pc2.id]


def test_hooks_see_a_new_device_before_its_links():
    devices, links = line()
    algorithm = Recorder()
    engine = start(devices, links, algorithm)

    r2 = Router(id=4, name="R2")
    devices.append(r2)
    links.append(connect(devices[1], r2))
    resync(engine, devices, links)

    assert algorithm.calls == [("added", r2.id, True), ("up", links[-1].id, True)]


def test_backward_learning_forgets_routes_through_a_vanished_link():
    devices, links = line()
    pc1, r1, pc2 = devices
    engine = start(devices, links, get_algorithm("backward_learning"))
    ping(engine, pc1, pc2, at=0.0)
    drain(engine)

    events = resync(engine, devices, [links[0]])

    tables = {e.node_id: e.payload["routes"] for e in events if e.type == "table_update"}
    assert [row["dest_name"] for row in tables[r1.id]] == ["PC1"]
    assert tables[pc2.id] == []


class FakeSocket:
    def __init__(self, broken=False):
        self.broken = broken
        self.sent = []

    async def send_json(self, payload):
        if self.broken:
            raise RuntimeError("socket closed")
        self.sent.append(payload)


def store_with_line():
    store = TopologyStore()
    store.devices, store.links = line()
    return store


def running_session(store, state="paused", at=500.0, socket=None):
    session = SimulationSession(socket or FakeSocket(), store)
    session.engine = SimulationEngine(NetworkSnapshot.from_db(store.devices, store.links), FirstNeighbor())
    session.clock.state = state
    session.clock._sim_at_anchor = at
    store.simulation_sessions.add(session)
    return session


def test_store_edits_reach_a_running_session_at_its_current_time():
    store = store_with_line()
    session = running_session(store)
    removed = store.links.pop()

    asyncio.run(store.sync_simulations())

    events = [m["event"] for m in session.ws.sent if m["type"] == "sim_event"]
    assert [(e["payload"]["change"], e["link_id"], e["t"]) for e in events] == [("link_down", removed.id, 500.0)]


def test_idle_sessions_are_left_alone_and_dead_ones_dropped():
    store = store_with_line()
    idle = running_session(store, state="idle")
    dead = running_session(store, socket=FakeSocket(broken=True))
    store.links.pop()

    asyncio.run(store.sync_simulations())

    assert idle.ws.sent == []
    assert dead not in store.simulation_sessions
    assert idle in store.simulation_sessions

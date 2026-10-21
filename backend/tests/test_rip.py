import ipaddress

import pytest

from objects.computer import Computer
from objects.router import Router
from simulation.algorithms.rip import INFINITY
from simulation.engine import SimConfig, SimulationEngine
from simulation.packet import Packet
from simulation.registry import get_algorithm, list_algorithms
from simulation.snapshot import NetworkSnapshot


def connect(a, b, ip_a, ip_b, link_id, mask=30):
    a.add_port(ip_a, mask)
    b.add_port(ip_b, mask)
    return a.add_link(b, a.port_number - 1, b.port_number - 1, 100, 10, "Mbps", link_id=link_id)


def attach_host(router, host, gateway_ip, host_ip, link_id):
    router.add_port(gateway_ip, 24)
    host.edit_port(host.ports[0], new_ip=host_ip, new_mask=24)
    return router.add_link(host, router.port_number - 1, 0, 100, 10, "Mbps", link_id=link_id)


def chain(n):
    routers = [Router(id=i + 1, name=f"R{i + 1}") for i in range(n)]
    links = [
        connect(routers[i], routers[i + 1], f"10.0.{i}.1", f"10.0.{i}.2", link_id=i + 1)
        for i in range(n - 1)
    ]
    return routers, links


def rip_engine(devices, links, seed=1, **options):
    algorithm = get_algorithm("rip_v2", options)
    snapshot = NetworkSnapshot.from_db(devices, links)
    engine = SimulationEngine(snapshot, algorithm, SimConfig(seed=seed, max_events=algorithm.max_events))
    engine.start()
    return engine


def run_until(engine, t_end):
    events = []
    while engine.peek_time() is not None and engine.peek_time() <= t_end:
        events += engine.advance()
    return events


def table(engine, router):
    return {
        f"{ipaddress.IPv4Address(network)}/{mask}": route
        for (network, mask), route in engine._algo_state[router.id]["routes"].items()
    }


def cut(engine, link):
    for node_id in (link.device_a, link.device_b):
        engine.snapshot._adjacency[node_id] = [
            adj for adj in engine.snapshot.neighbors(node_id) if adj.link_id != link.id
        ]


def history(events, router, dest):
    return [
        (event.t, row["metric"], row["next_hop_name"])
        for event in events
        if event.type == "table_update" and event.node_id == router.id
        for row in event.payload["routes"]
        if row["dest"] == dest
    ]


def test_chain_converges_to_hop_counts():
    routers, links = chain(5)
    engine = rip_engine(routers, links)
    run_until(engine, 60_000)

    for i, router in enumerate(routers):
        routes = table(engine, router)
        for j in range(len(links)):
            expected = 1 + (j - i if i <= j else i - (j + 1))
            assert routes[f"10.0.{j}.0/30"].metric == expected


def test_triggered_updates_converge_before_first_periodic_update():
    routers, links = chain(6)
    engine = rip_engine(routers, links)
    run_until(engine, 24_000)

    assert all(len(table(engine, router)) == len(links) for router in routers)


def test_without_triggered_updates_news_waits_for_periodic_updates():
    routers, links = chain(6)
    engine = rip_engine(routers, links, triggered_updates=False)

    run_until(engine, 20_000)
    assert not all(len(table(engine, router)) == len(links) for router in routers)

    run_until(engine, 6 * 35_000)
    assert all(len(table(engine, router)) == len(links) for router in routers)


def test_ping_crosses_converged_network():
    routers, links = chain(4)
    pc1, pc2 = Computer(id=101, name="PC1"), Computer(id=102, name="PC2")
    links += [
        attach_host(routers[0], pc1, "192.168.1.1", "192.168.1.10", link_id=50),
        attach_host(routers[-1], pc2, "192.168.2.1", "192.168.2.10", link_id=51),
    ]
    engine = rip_engine(routers + [pc1, pc2], links)
    run_until(engine, 40_000)

    ping = Packet.create_ping_packet(
        packet_id="ping", src_id=pc1.id, dst_id=pc2.id,
        dst_ip=engine.snapshot.first_ip(pc2.id), ttl=64, time=40_000,
    )
    engine.inject_packet(pc1.id, 40_000, ping)
    events = run_until(engine, 45_000)

    delivered = [e.payload.get("icmp") for e in events if e.type == "packet_delivered"]
    assert delivered == ["request", "reply"]


def test_ping_before_convergence_is_dropped_for_lack_of_route():
    routers, links = chain(4)
    pc1, pc2 = Computer(id=101, name="PC1"), Computer(id=102, name="PC2")
    links += [
        attach_host(routers[0], pc1, "192.168.1.1", "192.168.1.10", link_id=50),
        attach_host(routers[-1], pc2, "192.168.2.1", "192.168.2.10", link_id=51),
    ]
    engine = rip_engine(routers + [pc1, pc2], links)

    ping = Packet.create_ping_packet(
        packet_id="ping", src_id=pc1.id, dst_id=pc2.id,
        dst_ip=engine.snapshot.first_ip(pc2.id), ttl=64, time=0,
    )
    engine.inject_packet(pc1.id, 0, ping)
    events = run_until(engine, 100)

    drops = [e.payload["reason"] for e in events if e.type == "packet_dropped" and e.kind == "data"]
    assert drops == ["no_route"]


def test_networks_sixteen_hops_away_are_unreachable():
    routers, links = chain(17)
    engine = rip_engine(routers, links)
    run_until(engine, 150_000)

    routes = table(engine, routers[0])
    assert routes["10.0.14.0/30"].metric == 15
    assert "10.0.15.0/30" not in routes


@pytest.mark.parametrize("mode, expected", [
    ("off", 2),
    ("simple", None),
    ("poisoned_reverse", INFINITY),
])
def test_split_horizon_controls_what_is_advertised_back(mode, expected):
    routers, links = chain(4)
    engine = rip_engine(routers, links, split_horizon=mode)
    run_until(engine, 60_000)

    r2, r3 = routers[1], routers[2]
    towards_r3 = next(adj for adj in engine.snapshot.neighbors(r2.id) if adj.neighbor_id == r3.id)
    entries = engine.algorithm._entries_for(engine._algo_state[r2.id], towards_r3, only_changed=False)
    metrics = {f"{e['network']}/{e['mask']}": e["metric"] for e in entries}

    assert metrics.get("10.0.2.0/30") == expected
    assert metrics["10.0.1.0/30"] == 1


def run_link_failure(seed, **options):
    routers, links = chain(5)
    engine = rip_engine(routers, links, seed=seed, **options)
    run_until(engine, 60_000)
    cut(engine, links[2])
    return routers, engine, run_until(engine, 1_500_000)


def loop_formed(routers, events):
    return any(next_hop == "R2" for _, _, next_hop in history(events, routers[2], "10.0.3.0/30"))


def test_count_to_infinity_without_split_horizon():
    runs = [run_link_failure(seed, split_horizon="off", triggered_updates=False) for seed in range(1, 11)]

    looping = [(routers, events) for routers, _, events in runs if loop_formed(routers, events)]
    assert looping
    routers, events = looping[0]
    metrics_via_r2 = [metric for _, metric, next_hop in history(events, routers[2], "10.0.3.0/30") if next_hop == "R2"]
    assert metrics_via_r2 == sorted(metrics_via_r2)
    assert metrics_via_r2[-1] == INFINITY

    for routers, engine, _ in runs:
        for router in routers[:3]:
            assert "10.0.3.0/30" not in table(engine, router)


@pytest.mark.parametrize("options", [
    {"split_horizon": "poisoned_reverse", "triggered_updates": False},
    {"split_horizon": "off", "triggered_updates": False, "hold_down": True},
])
def test_split_horizon_or_hold_down_prevent_the_loop(options):
    for seed in range(1, 11):
        routers, engine, events = run_link_failure(seed, **options)
        assert not loop_formed(routers, events)
        assert "10.0.3.0/30" not in table(engine, routers[0])


def test_timeout_poisons_routes_behind_a_dead_link():
    routers, engine, events = run_link_failure(1)

    timeline = history(events, routers[0], "10.0.3.0/30")
    poisoned_at = next(t for t, metric, _ in timeline if metric == INFINITY)
    assert 200_000 <= poisoned_at <= 250_000


def test_rip_options_fall_back_to_rfc_defaults():
    algorithm = get_algorithm("rip_v2", {"split_horizon": "bogus", "hold_down": True, "unknown": 1})
    assert algorithm.options == {
        "split_horizon": "poisoned_reverse",
        "triggered_updates": True,
        "hold_down": True,
        "failure_detection": "immediate",
    }

    info = next(a for a in list_algorithms() if a["name"] == "rip_v2")
    assert [option["key"] for option in info["options"]] == [
        "split_horizon", "triggered_updates", "hold_down", "failure_detection",
    ]


def test_rip_control_packets_carry_a_summary():
    routers, links = chain(2)
    engine = rip_engine(routers, links)
    events = run_until(engine, 2_000)

    summaries = {e.payload["summary"].split(":")[0] for e in events if e.type == "packet_sent"}
    assert summaries == {"Request", "Response"}


def test_shared_subnet_is_reported():
    r1, r2, r3 = Router(id=1, name="R1"), Router(id=2, name="R2"), Router(id=3, name="R3")
    links = [
        connect(r1, r2, "128.0.0.1", "128.0.0.2", link_id=1, mask=24),
        connect(r1, r3, "128.0.0.3", "128.0.0.4", link_id=2, mask=24),
    ]
    engine = SimulationEngine(NetworkSnapshot.from_db([r1, r2, r3], links), get_algorithm("rip_v2"))
    events = engine.start()

    warnings = [e for e in events if e.type == "node_log" and e.node_id == r1.id]
    assert warnings and "128.0.0.0/24" in warnings[0].payload["message"]


def resync(engine, devices, links, at):
    return engine.apply_topology(NetworkSnapshot.from_db(devices, links), at=at)


def square():
    routers = [Router(id=i + 1, name=f"R{i + 1}") for i in range(4)]
    links = [
        connect(routers[i], routers[(i + 1) % 4], f"10.0.{i}.1", f"10.0.{i}.2", link_id=i + 1)
        for i in range(4)
    ]
    return routers, links


def run_with_removed_link(failure_detection):
    routers, links = chain(5)
    engine = rip_engine(routers, links, failure_detection=failure_detection)
    run_until(engine, 60_000)
    links.pop(2)
    resync(engine, routers, links, at=60_000)
    return routers, engine, run_until(engine, 600_000)


def test_removed_link_is_detected_immediately_by_default():
    routers, engine, events = run_with_removed_link("immediate")

    timeline = history(events, routers[0], "10.0.3.0/30")
    poisoned_at = next(t for t, metric, _ in timeline if metric == INFINITY)
    assert poisoned_at < 70_000
    assert "10.0.2.0/30" not in table(engine, routers[0])
    assert "10.0.3.0/30" not in table(engine, routers[0])


def test_silent_link_failure_waits_for_the_route_timeout():
    routers, engine, events = run_with_removed_link("timeout")

    timeline = history(events, routers[0], "10.0.3.0/30")
    poisoned_at = next(t for t, metric, _ in timeline if metric == INFINITY)
    assert poisoned_at >= 210_000


def test_traffic_reroutes_around_a_removed_link():
    routers, links = square()
    engine = rip_engine(routers, links)
    run_until(engine, 60_000)
    assert table(engine, routers[0])["10.0.1.0/30"].next_hop_id == routers[1].id

    links.pop(0)
    resync(engine, routers, links, at=60_000)
    run_until(engine, 100_000)

    route = table(engine, routers[0])["10.0.1.0/30"]
    assert (route.metric, route.next_hop_id) == (3, routers[3].id)


def test_router_added_mid_run_joins_the_network_quickly():
    routers, links = chain(3)
    engine = rip_engine(routers, links)
    run_until(engine, 60_000)

    r4 = Router(id=4, name="R4")
    routers.append(r4)
    resync(engine, routers, links, at=60_000)
    links.append(connect(routers[2], r4, "10.0.2.1", "10.0.2.2", link_id=3))
    resync(engine, routers, links, at=61_000)
    run_until(engine, 75_000)

    assert table(engine, routers[0])["10.0.2.0/30"].metric == 3
    assert table(engine, r4)["10.0.0.0/30"].metric == 3


def test_readdressed_link_is_announced_and_its_old_subnet_withdrawn():
    routers, links = chain(3)
    engine = rip_engine(routers, links)
    run_until(engine, 60_000)

    r1, r2, r3 = routers
    r1.edit_port(r1.ports[0], new_ip="10.0.9.1")
    r2.edit_port(r2.ports[0], new_ip="10.0.9.2")
    resync(engine, routers, links, at=60_000)
    run_until(engine, 70_000)

    routes = table(engine, r3)
    assert routes["10.0.9.0/30"].metric == 2
    assert not routes["10.0.0.0/30"].reachable

    run_until(engine, 400_000)
    assert "10.0.0.0/30" not in table(engine, r3)

# Routing Test Topologies

Test networks for a dynamic routing engine (**RIP** / **EIGRP**). Every file matches the
storage schema and can be loaded directly:

```jsonc
{
  "devices_db": [ 
    { 
      "name",
      "port_number",
      "ports": [ 
        { 
          "ip",
          "mask" 
        } 
      ],
      "id",
      "routing_table": []
    }
  ],
  "links_db": [
    {
      "id",
      "device_a",
      "device_b",
      "port_a_num",
      "port_b_num",
      "bandwidth",
      "delay",
      "unit"
    }
  ]
}
```

## Addressing convention

Every link is a point-to-point **/30**: subnet `10.<id÷256>.<id mod 256>.0/30`, with
`device_a = .1` and `device_b = .2`. Each router port belongs to exactly one link, so a
router's *degree* equals its `port_number`.

## Metric labels

Link labels below are written **`bandwidth(Mbps) / delay`**. RIP ranks paths by **hop
count** only (max 15; 16 = unreachable). EIGRP ranks by a **bandwidth + delay composite**,
so on any link where a short path is slow or a long path is fast, the two protocols choose
**different routes** — that is what most of these topologies are designed to expose.

## How to connect computers and send pings

Two ways to test:

1. **No edits (fastest).** From a source router, ping *any interface IP* of a destination
   router. The ping only succeeds if **every** router on the path installed a route to that
   `/30`, so it exercises exactly the routing tables your engine builds. Use **traceroute**
   to see *which* path was chosen (this is where RIP and EIGRP differ).
2. **Real hosts.** Add a LAN port (e.g. a `/24`) to the two edge routers, give each a PC
   (`.10`, gateway `.1`), and let the engine advertise those LAN subnets. Then ping PC→PC.

Put PCs on **leaf / edge routers** (chain ends, branches, customer edges) — the core is
just transit. Each section below lists the exact router and gateway IP to attach to.

> **Start here:** topology **03** (RIP vs EIGRP pick different paths), **07** (RIP's 15-hop
> ceiling and count-to-infinity), and **08 / 14** (fast vs slow failover).

## Index

| # | File | Routers | Links | Theme |
|---|------|:------:|:-----:|-------|
| 01 | [01_tree_baseline.json](01_tree_baseline.json) | 12 | 11 | Loop-free tree — one path per pair (control case) |
| 02 | [02_linear_chain.json](02_linear_chain.json) | 14 | 13 | Straight chain — hop accumulation |
| 03 | [03_interlocking_loops.json](03_interlocking_loops.json) | 12 | 21 | **Many loops — RIP hop-count vs EIGRP metric** |
| 04 | [04_ring.json](04_ring.json) | 16 | 16 | Ring — two equal-cost directions |
| 05 | [05_star_hub.json](05_star_hub.json) | 15 | 14 | Hub-and-spoke — single point of failure |
| 06 | [06_full_mesh.json](06_full_mesh.json) | 10 | 45 | Full mesh — instant alternate paths |
| 07 | [07_count_to_infinity_chain.json](07_count_to_infinity_chain.json) | 20 | 19 | **RIP 15-hop limit + count-to-infinity** |
| 08 | [08_parallel_redundant_links.json](08_parallel_redundant_links.json) | 10 | 17 | **EIGRP feasible successor / UCMP** |
| 09 | [09_hierarchical.json](09_hierarchical.json) | 21 | 30 | 3-tier core/dist/access with redundancy |
| 10 | [10_partial_mesh.json](10_partial_mesh.json) | 24 | 42 | Ring + chords — scaled RIP vs EIGRP |
| 11 | [11_huge_random_100.json](11_huge_random_100.json) | 100 | 249 | Huge random mesh (~150 loops) |
| 12 | [12_huge_random_250.json](12_huge_random_250.json) | 250 | 549 | Huge random mesh (~300 loops) |
| 13 | [13_huge_random_400.json](13_huge_random_400.json) | 400 | 799 | Huge random mesh (~400 loops) |
| 14 | [14_enterprise_wan_dual_mpls.json](14_enterprise_wan_dual_mpls.json) | 14 | 21 | **Enterprise WAN — dual MPLS + Internet backup** |
| 15 | [15_dual_datacenter.json](15_dual_datacenter.json) | 18 | 26 | **Dual data center — active/active** |
| 16 | [16_isp_backbone_ring.json](16_isp_backbone_ring.json) | 15 | 19 | **ISP backbone — ring + chord + peering** |

---

## 01 · Tree baseline

Binary tree rooted at `R0`; all links `100/10`. Leaves: `R6, R7, R8, R9, R10, R11`.

```mermaid
graph TD
    R0 --- R1 & R2
    R1 --- R3
    R3 --- R7
    R2 --- R4 & R5 & R6
    R4 --- R8 & R9 & R10
    R5 --- R11
```

- **Interesting paths:** exactly **one** path between any two routers — no loops, no
  redundancy. RIP and EIGRP always agree. Useful as a *control* to confirm basic
  convergence before testing the harder topologies.
- **Connect computers:** PC-A → **R7** (gw `10.0.6.1`), PC-B → **R11** (gw `10.0.10.1`).
  Ping `R7 → 10.0.10.1`: path `R7→R3→R1→R0→R2→R5→R11` (**6 hops**).
- **Failure test:** cut **R0–R2** (`10.0.1.0/30`) → the entire `R2` subtree becomes
  unreachable with **no reroute** (a tree has no backup paths).

## 02 · Linear chain

14 routers in a line; all links `100/10`.

```mermaid
graph LR
    R0 --- R1 --- R2 --- R3 --- R4 --- R5 --- R6
    R6 --- R7 --- R8 --- R9 --- R10 --- R11 --- R12 --- R13
```

- **Interesting paths:** pure hop accumulation, single path. End-to-end is **13 hops** —
  still inside RIP's limit (compare with #07, which exceeds it).
- **Connect computers:** PC-A → **R0** (gw `10.0.0.1`), PC-B → **R13** (gw `10.0.12.2`).
  Ping `R0 → 10.0.12.2`.
- **Failure test:** cut a middle link, e.g. **R6–R7** (`10.0.6.0/30`) → the far half is
  isolated; RIP poisons the route, EIGRP marks it unreachable immediately.

## 03 · Interlocking loops  ⭐

Chain `R0…R11` (`100/10`) plus 10 *slow* chords (`10/100`) that create many overlapping
cycles.

```mermaid
graph LR
    R0 ---|"100/10"| R1 ---|"100/10"| R2 ---|"100/10"| R3 ---|"100/10"| R4 ---|"100/10"| R5
    R5 ---|"100/10"| R6 ---|"100/10"| R7 ---|"100/10"| R8 ---|"100/10"| R9 ---|"100/10"| R10 ---|"100/10"| R11
    R0 -.->|"10/100"| R2
    R1 -.->|"10/100"| R3
    R3 -.->|"10/100"| R5
    R5 -.->|"10/100"| R7
    R7 -.->|"10/100"| R9
    R9 -.->|"10/100"| R11
    R0 -.->|"10/100 chord"| R11
    R2 -.->|"10/100"| R6
    R4 -.->|"10/100"| R8
    R6 -.->|"10/100"| R10
```

- **Interesting paths:** `R0` and `R11` are joined **directly** by the slow chord
  (`10.0.17.0/30`) *and* by the 11-hop fast chain.
  - **RIP** takes the **1-hop 10 Mbps chord** (fewest hops).
  - **EIGRP** takes the **11-hop 100 Mbps chain** (composite metric ≈ 210 vs 1100).
  Same reachability, opposite path — the clearest RIP-vs-EIGRP contrast in the set.
- **Connect computers:** PC-A → **R0** (gw `10.0.0.1`), PC-B → **R11** (gw `10.0.10.2`).
  **Traceroute** `R0 → R11` under each protocol to see the different route.
- **Failure test:** cut the chord **`10.0.17.0/30`** → RIP must reconverge onto a longer
  path; the many cycles exercise split-horizon / poison-reverse loop avoidance.

## 04 · Ring

16 routers in a ring; all links `100/10`.

```mermaid
graph LR
    R0 --- R1 --- R2 --- R3 --- R4 --- R5 --- R6 --- R7 --- R8
    R8 --- R9 --- R10 --- R11 --- R12 --- R13 --- R14 --- R15 --- R0
```

- **Interesting paths:** to the opposite node there are **two equal-cost directions**
  (clockwise / counter-clockwise), each 8 hops → both RIP and EIGRP load-balance (ECMP).
- **Connect computers:** PC-A → **R0** (gw `10.0.0.1`), PC-B → **R8** (gw `10.0.7.2`).
  Ping `R0 → 10.0.7.2`.
- **Failure test:** cut **R3–R4** (`10.0.3.0/30`) → the ring stays fully connected via the
  other direction; a great *survivable* reconvergence demo (no outage).

## 05 · Star / hub-and-spoke

One hub (`R0_hub`, 14 ports) with 14 spokes; all links `100/10`.

```mermaid
graph TD
    R0_hub --- R1_spoke & R2_spoke & R3_spoke & R4_spoke & R5_spoke & R6_spoke & R7_spoke
    R0_hub --- R8_spoke & R9_spoke & R10_spoke & R11_spoke & R12_spoke & R13_spoke & R14_spoke
```

- **Interesting paths:** every spoke-to-spoke path is exactly **2 hops** through the hub;
  there are no alternates. The hub is a single point of failure.
- **Connect computers:** PC-A → **R1_spoke** (gw `10.0.0.2`), PC-B → **R8_spoke**
  (gw `10.0.7.2`). Ping `R1 → 10.0.7.2`: `R1_spoke→R0_hub→R8_spoke`.
- **Failure test:** cut any spoke link (e.g. `10.0.0.0/30`) → that spoke is isolated; all
  other spokes are unaffected.

## 06 · Full mesh

10 routers, every pair connected (45 links), all `1000/10`.

```mermaid
graph LR
    R0 --- R1 & R2 & R3 & R4 & R5 & R6 & R7 & R8 & R9
    R1 --- R2 & R3 & R4 & R5 & R6 & R7 & R8 & R9
    R2 --- R3 & R4 & R5 & R6 & R7 & R8 & R9
    R3 --- R4 & R5 & R6 & R7 & R8 & R9
    R4 --- R5 & R6 & R7 & R8 & R9
    R5 --- R6 & R7 & R8 & R9
    R6 --- R7 & R8 & R9
    R7 --- R8 & R9
    R8 --- R9
```

- **Interesting paths:** every pair is **1 hop** direct. EIGRP has 8 feasible successors for
  every destination.
- **Connect computers:** PC-A → **R0** (gw `10.0.0.1`), PC-B → **R9** (gw `10.0.8.2`).
  Ping `R0 → 10.0.8.2` (direct via `10.0.8.0/30`).
- **Failure test:** cut the direct **R0–R9** link (`10.0.8.0/30`) → traffic instantly
  reroutes 2 hops via any third router (e.g. `R0→R1→R9`) with near-zero loss.

## 07 · Count-to-infinity chain  ⭐

20 routers in a line; all links `100/10`. End-to-end = **19 hops**.

```mermaid
graph LR
    R0 --- R1 --- R2 --- R3 --- R4 --- R5 --- R6 --- R7 --- R8 --- R9
    R9 --- R10 --- R11 --- R12 --- R13 --- R14 --- R15 --- R16 --- R17 --- R18 --- R19
```

- **Interesting paths:**
  - **RIP diameter limit:** `R0 → R15` (`10.0.14.2`) = 15 hops **works**; `R0 → R16`
    (`10.0.15.2`) = 16 hops is **unreachable** under RIP but fine under EIGRP.
  - **Count-to-infinity:** while pinging `R0 → R19`, cut **R9–R10** (`10.0.9.0/30`). With
    split-horizon disabled, watch RIP's metric climb slowly to 16; EIGRP declares
    unreachable almost immediately.
- **Connect computers:** PC-A → **R0** (gw `10.0.0.1`), PC-B → **R19** (gw `10.0.18.2`).
- **Failure test:** the R9–R10 cut above (no redundant path exists, so the demonstration is
  the *convergence time* difference, not survivability).

## 08 · Parallel redundant links  ⭐

10-router fast spine (`1000/10`) with parallel slow links and feasibility cross-links.

```mermaid
graph LR
    R0 ---|"1000/10"| R1 ---|"1000/10"| R2 ---|"1000/10"| R3 ---|"1000/10"| R4 ---|"1000/10"| R5
    R5 ---|"1000/10"| R6 ---|"1000/10"| R7 ---|"1000/10"| R8 ---|"1000/10"| R9
    R0 -.->|"100/100"| R1
    R2 -.->|"100/100"| R3
    R4 -.->|"100/100"| R5
    R6 -.->|"100/100"| R7
    R8 -.->|"100/100"| R9
    R0 -.->|"100/200"| R2
    R3 -.->|"100/150"| R6
    R5 -.->|"100/180"| R9
```

- **Interesting paths:** the spine is primary; the cross-links `R0–R2`, `R3–R6`, `R5–R9`
  are **feasible successors**. With `variance`, EIGRP can unequal-cost load-balance over the
  parallel `1000` + `100` links.
- **Connect computers:** PC-A → **R0** (gw `10.0.0.1`), PC-B → **R9** (gw `10.0.8.2`).
- **Failure test:** cut **R8–R9** (`10.0.8.0/30`) → EIGRP instantly uses the **R5–R9**
  cross-link (`10.0.16.0/30`) — near-zero loss; RIP drops traffic for several seconds.

## 09 · Hierarchical (core / distribution / access)

3 core (`C0–C2`, full mesh, `1000/10`), 6 distribution (`D0–D5`, each dual-homed to two
cores), 12 access (`A0–A11`, one per parent), plus `D0–D1 / D2–D3 / D4–D5` links (`100/10`).

```mermaid
graph TD
    C0 --- C1 --- C2 --- C0
    D0 --- C0 & C1
    D1 --- C0 & C2
    D2 --- C1 & C2
    D3 --- C0 & C1
    D4 --- C1 & C2
    D5 --- C0 & C2
    D0 --- A0 & A1
    D1 --- A2 & A3
    D2 --- A4 & A5
    D3 --- A6 & A7
    D4 --- A8 & A9
    D5 --- A10 & A11
```

- **Interesting paths:** access-to-access always climbs to the core and back, but each
  distribution router is **dual-homed** to two cores → redundant paths and EIGRP feasible
  successors.
- **Connect computers:** PC-A → **A0** (gw `10.0.18.2`, under D0), PC-B → **A11**
  (gw `10.0.29.2`, under D5). Ping `A0 → 10.0.29.2`: e.g. `A0→D0→C0→D5→A11` (4 hops).
- **Failure test:** cut **D0–C0** (`10.0.3.0/30`) → D0 reroutes through its second uplink
  `C1` with no outage.

## 10 · Structured partial mesh

Ring of 24 (`R0…R23`) plus 18 chords, varied metrics.

```mermaid
graph LR
    R0 --- R1 --- R2 --- R3 --- R4 --- R5 --- R6 --- R7 --- R8 --- R9 --- R10 --- R11
    R11 --- R12 --- R13 --- R14 --- R15 --- R16 --- R17 --- R18 --- R19 --- R20 --- R21 --- R22 --- R23 --- R0
    R0 -.->|"10/100 chord"| R12
    R0 -.-> R6
    R2 -.-> R8
    R3 -.-> R9
    R4 -.-> R10
```
*(ring shown solid; a few representative chords dotted — see the file for all 18.)*

- **Interesting paths:** a scaled version of #03. `R0→R12` is **1 hop** over the slow
  `10/100` chord (`10.0.25.0/30`) but 12 hops around the ring — **RIP takes the chord,
  EIGRP weighs its poor bandwidth against the faster ring**. Many chords → many divergences.
- **Connect computers:** PC-A → **R0** (gw `10.0.0.1`), PC-B → **R12** (gw `10.0.11.2`).
  Traceroute to compare protocols.
- **Failure test:** cut a ring segment (e.g. `10.0.5.0/30`, R5–R6) → reroute via chords.

## 11–13 · Huge random meshes

Connected random graphs (random spanning tree + extra random edges), **random bandwidth**
`{10, 100, 1000, 10000}` Mbps and **random delay** `1–199`. Seeded, so they regenerate
identically.

| # | Routers | Links | Independent loops | Avg degree |
|---|:------:|:----:|:-----------------:|:----------:|
| 11 | 100 | 249 | ~150 | 4.98 |
| 12 | 250 | 549 | ~300 | 4.39 |
| 13 | 400 | 799 | ~400 | 4.00 |

- **Interesting paths:** hundreds of independent cycles mean RIP (hop count) and EIGRP
  (composite) disagree constantly, and there are many alternates to reconverge onto after a
  failure. On the 250- and 400-node graphs the **network diameter can exceed 15 hops**, so
  some node pairs are **unreachable under RIP** while EIGRP still routes them — a good
  large-scale illustration of RIP's limit.
- **Connect computers** (use low-degree *stub* routers, which behave like edge sites):
  - **11:** PC-A → **R76** (gw `10.0.75.1`), PC-B → **R88** (gw `10.0.87.1`).
  - **12:** PC-A → **R77** (gw `10.0.76.1`), PC-B → **R239** (gw `10.0.238.1`).
  - **13:** PC-A → **R95** (gw `10.0.94.1`), PC-B → **R379** (gw `10.1.122.1`).
- **Failure test:** traceroute the active path, cut one of its links, and watch the reroute
  among the many alternates (fast for EIGRP, slower for RIP).

---

## 14 · Enterprise WAN — dual MPLS + Internet backup  ⭐

**Naming:** letter = sub-network. **A** = HQ / data-center core, **B** = WAN transport,
**C** = branches / remote.
`A1` HQ core · `A2/A3` HQ WAN edges · `A4` data center · `B1/B2` MPLS PEs · `B3` Internet
gateway · `C1–C4,C6` branches · `C5` dual-homed branch · `C7` DR site.

```mermaid
graph LR
    A1 ---|"1000/10"| A2
    A1 ---|"1000/10"| A3
    A1 ---|"10000/5"| A4
    A2 ---|"100/20"| B1
    A3 ---|"100/20"| B2
    A3 -.->|"50/40 backup"| B3
    B1 ---|"1000/15"| B2
    C1 ---|"100/25"| B1
    C1 -.->|"10/80"| B3
    C2 ---|"100/30"| B1
    C2 -.->|"10/90"| B3
    C3 ---|"100/25"| B2
    C3 -.->|"10/85"| B3
    C4 ---|"100/35"| B2
    C4 -.->|"10/95"| B3
    C5 ---|"100/28"| B1
    C5 ---|"100/32"| B2
    C6 ---|"100/40"| B1
    C6 -.->|"10/100"| B3
    C7 ---|"100/30"| B2
    C7 ---|"1000/25"| A4
```

- **Interesting paths:** `C1 → A4` (data center) is **4 hops** via MPLS
  (`C1→B1→A2→A1→A4`) *and* **4 hops** via the Internet backup (`C1→B3→A3→A1→A4`). **RIP
  ties on hop count and may forward over the 10 Mbps backup; EIGRP stays on the 100 Mbps
  MPLS** and keeps the Internet path as a feasible-successor backup.
- **Connect computers:** PC-A → **C1** (gw `10.0.7.1`), PC-B → data center **A4**
  (gw `10.0.2.2`). Ping/traceroute `C1 → 10.0.2.2`.
- **Failure test:** cut **C1–B1** (`10.0.7.0/30`) → traffic fails over to the Internet
  backup `C1→B3` (`10.0.8.0/30`). Also PC on **C5** (gw `10.0.15.1`); cut **C5–B1**
  (`10.0.15.0/30`) → EIGRP uses the `B2` feasible successor instantly.

## 15 · Dual data center (active/active)  ⭐

**Naming:** **A** = DC1, **B** = DC2, **C** = WAN aggregation, **D** = branches,
**E** = Internet / campus edges.
`A1/A2` DC1 cores · `B1/B2` DC2 cores · `C1` WAN-east · `C2` WAN-west · `C3` WAN-central ·
`D1–D7` branches · `E1/E2` Internet · `E3/E4` campus.

```mermaid
graph TD
    A1 ---|"10000/5"| A2
    B1 ---|"10000/5"| B2
    A1 ---|"1000/30 DCI"| B1
    A2 -.->|"1000/35 DCI-bak"| B2
    C1 ---|"1000/20"| A1
    C1 -.->|"1000/40"| B1
    C2 ---|"1000/20"| B2
    C2 -.->|"1000/40"| A2
    C3 ---|"1000/25"| A1
    C3 ---|"1000/25"| B2
    D1 ---|"100/15"| C1
    D1 -.->|"100/50"| C3
    D2 ---|"100/18"| C1
    D2 -.->|"100/55"| C3
    D3 ---|"100/15"| C2
    D3 -.->|"100/50"| C3
    D4 ---|"100/18"| C2
    D5 ---|"100/15"| C3
    D5 -.->|"100/45"| C1
    D6 ---|"100/16"| C3
    D7 ---|"100/17"| C3
    D7 -.->|"100/48"| C2
    E1 ---|"500/25"| A1
    E2 ---|"500/25"| B2
    E3 ---|"1000/12"| C1
    E4 ---|"1000/12"| C2
```

- **Interesting paths:**
  - `C3` (WAN-central) reaches **both** data centers at equal `1000/25` → EIGRP
    **equal-cost load balancing** across DC1 and DC2.
  - `D1 → DC2 edge E2`: **RIP** takes the fewest hops (via central `C3→B2`); **EIGRP**
    compares cumulative delay and may route through the East region + DCI
    (`D1→C1→A1→B1→B2`) — more hops, lower delay.
- **Connect computers:** PC-A → east branch **D1** (gw `10.0.10.1`), PC-B → DC2 edge **E2**
  (gw `10.0.23.1`). Traceroute `D1 → 10.0.23.1` under each protocol.
- **Failure test:** cut **D1–C1** (`10.0.10.0/30`) → D1 falls back to its `C3` backup
  (`10.0.11.0/30`). For ECMP, put a PC on central branch **D6** (gw `10.0.19.1`).

## 16 · Regional ISP backbone  ⭐

**Naming:** **A** = core POPs, **B** = aggregation, **C** = customer edges,
**D** = transit / peering.
`A1–A6` core ring · `B1/B2` aggregation · `C1–C4` customers · `D1` transit · `D2` IX peer ·
`D3` CDN peer.

```mermaid
graph LR
    A1 ---|"10000/10"| A2
    A2 ---|"10000/12"| A3
    A3 ---|"10000/10"| A4
    A4 ---|"10000/15"| A5
    A5 ---|"10000/10"| A6
    A6 ---|"10000/20"| A1
    A1 -.->|"10000/25 chord"| A4
    B1 ---|"1000/15"| A1
    B1 ---|"1000/18"| A2
    B2 ---|"1000/15"| A4
    B2 ---|"1000/18"| A5
    C1 ---|"100/20"| B1
    C2 ---|"100/22"| B1
    C3 ---|"100/20"| B2
    C4 ---|"100/22"| B2
    D1 ---|"1000/30"| A1
    D1 -.->|"1000/35"| A3
    D2 ---|"1000/25"| A3
    D3 ---|"10000/15"| A5
```

- **Interesting paths:**
  - `C1 → C3`: the **A1–A4 chord** yields a 5-hop path vs the 7-hop ring — a clean
    chord-vs-ring choice.
  - `C1 → CDN D3` (at A5): from A1 there are **two 2-hop directions** (via `A6`, or via
    the chord + `A4`). RIP can't tell them apart; EIGRP picks the lower-delay `A6`
    direction.
  - Transit `D1` is **dual-homed** to `A1`/`A3` → successor + feasible successor for the
    default route.
- **Connect computers:** PC-A → customer **C1** (gw `10.0.11.1`), PC-B → customer **C3**
  (gw `10.0.13.1`). For the transit test, ping **C1 → D1** (`10.0.15.1`).
- **Failure test:** cut **A1–D1** (`10.0.15.0/30`) → EIGRP switches the default route to the
  `A3` feasible successor with no recomputation.

---

## Quick reference — recommended experiments

| Goal | Topology | Attach PCs | Action |
|------|----------|------------|--------|
| RIP vs EIGRP pick different paths | 03 | R0 (`10.0.0.1`), R11 (`10.0.10.2`) | traceroute both ways |
| RIP 15-hop limit | 07 | R0 (`10.0.0.1`), R16 (`10.0.15.2`) | ping — fails on RIP only |
| Count-to-infinity | 07 | R0, R19 (`10.0.18.2`) | ping, cut `10.0.9.0/30` |
| Feasible-successor failover | 08 | R0 (`10.0.0.1`), R9 (`10.0.8.2`) | ping, cut `10.0.8.0/30` |
| Survivable ring reroute | 04 | R0 (`10.0.0.1`), R8 (`10.0.7.2`) | ping, cut `10.0.3.0/30` |
| Backup-link failover | 14 | C1 (`10.0.7.1`), A4 (`10.0.2.2`) | ping, cut `10.0.7.0/30` |
| Equal-cost load balancing | 15 | D6 (`10.0.19.1`) → both DCs | inspect EIGRP table |
| Chord vs ring | 16 | C1 (`10.0.11.1`), C3 (`10.0.13.1`) | traceroute |

*Generated by `generate_topologies.ps1`. Ping targets are router interface IPs; add LAN
host subnets on the listed edge routers if you want to ping real PCs.*

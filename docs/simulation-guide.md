# Przewodnik: jak działa silnik symulacji i jak pisać własne algorytmy

Ten dokument tłumaczy **każdą klasę** pakietu `backend/simulation/` oraz pokazuje
krok po kroku, jak samodzielnie dodać algorytm trywialny (bez pakietów kontrolnych)
i konwergentny (z pakietami kontrolnymi, jak RIP/OSPF). Architektura i decyzje:
`docs/simulation-design.md`.
---
## 1. Wielki obraz w trzech zdaniach

1. Przy starcie symulacji backend robi **kopię topologii** (`NetworkSnapshot`)
   i tworzy **silnik zdarzeniowy** (`SimulationEngine`) z wybranym algorytmem. Każda
   edycja sieci w trakcie (dodanie/usunięcie urządzenia lub łącza, zmiana parametrów
   łącza, adresów, tras) daje nową kopię, a silnik informuje o różnicach Twój algorytm
   (sekcja 5a).
2. Silnik przetwarza kolejkę zdarzeń „pakiet dotarł do węzła X w chwili t" /
   „timer węzła X zadzwonił w chwili t" i przy każdym pyta **Twój algorytm**, co dalej;
   wszystko, co się dzieje, wychodzi na zewnątrz jako strumień **`SimEvent`ów**.
3. Sesja WebSocket (`SimulationSession`) odtwarza ten strumień w tempie czasu
   rzeczywistego × prędkość i przyjmuje komendy (ping, pauza, krok…), a frontend
   go tylko renderuje.

Twój algorytm **nigdy** nie dotyka kolejki, zegara, WebSocketów ani prawdziwych
urządzeń — dostaje `SimContext` i to jest cały jego świat.

---

## 2. Mapa plików i klas

### `simulation/events.py` — `SimEvent`
Jedno „tyknięcie" symulacji, wspólny język backendu i frontu. Pola: `seq` (numer),
`t` (czas symulacji w ms), `type`, `kind` (`data`/`control`), `packet_id`,
`protocol`, `from_id`/`to_id`/`link_id` (dla sent/recv), `node_id` (dla zdarzeń
węzłowych), `payload` (szczegóły). Typy zdarzeń:

| Typ | Kiedy | Emituje |
|---|---|---|
| `packet_sent` | pakiet wychodzi na łącze (t = nadanie) | silnik, przy `ctx.forward`/`ctx.send_control` |
| `packet_recv` | pakiet dochodzi do węzła (t = nadanie + delay) | silnik |
| `packet_delivered` | pakiet **danych** dotarł do adresata | silnik |
| `packet_dropped` | TTL wyczerpany albo `ctx.drop(...)` | silnik / Ty |
| `table_update` | węzeł „nauczył się" tras | Ty, przez `ctx.table_update` |
| `topology_change` | użytkownik zmienił sieć w trakcie symulacji (`payload.change`: `link_up`, `link_down`, `link_changed`, `node_added`, `node_removed`) | silnik |
| `node_log` | dowolny komunikat do logu w UI | Ty, przez `ctx.log` |

**Nie tworzysz `SimEvent`ów ręcznie** — powstają jako efekt uboczny wywołań `ctx.*`.

### `simulation/packet.py` — `Packet`
Pakiet w locie: `id` („p1", „p2"…), `kind` (`data`/`control`), `protocol`
(etykieta do UI: „icmp", „hello", „dv"…), `src_id`, `dst_id`, `dst_ip`, `ttl`,
`meta` (wolny słownik-brudnopis).

Konwencje w `meta`:
- `prev_node` — silnik zapisuje tu, skąd pakiet przyszedł (do unikania zawracania),
- `icmp` (`request`/`reply`), `created_t`, `request_id`, `request_created_t` —
  obsługa pingu (silnik),
- `payload` — treść pakietu **kontrolnego** (Ty, przez `ctx.send_control`).

`packet.copy()` — niezależna kopia (własne `ttl`/`meta`). **Obowiązkowa przy
floodingu**: wysłanie tego samego obiektu do dwóch sąsiadów naraz to bug
(współdzielony TTL i `prev_node`).

### `simulation/snapshot.py` — `NetworkSnapshot`, `SimNode`, `SimLink`, `Adjacency`
Kopia topologii, na której działa symulacja (podmieniana po każdej edycji w trakcie
symulacji, patrz sekcja 5a). Najważniejsze dla Ciebie:

- `ctx.net.neighbors(node_id)` → lista **`Adjacency`** — to na nich operujesz:

  | Pole | Znaczenie |
  |---|---|
  | `link_id` | id łącza (do zdarzeń) |
  | `neighbor_id` | id sąsiada po drugiej stronie |
  | `local_port` / `local_ip` / `local_mask` | mój interfejs na tym łączu |
  | `neighbor_ip` | adres interfejsu sąsiada (= next hop przez to łącze) |
  | `delay` | opóźnienie łącza w ms (koszt!) |
  | `bandwidth` | przepustowość (może być `None`) |

- `SimNode`: `id`, `name`, `is_router`, `ports [(ip, mask)]`, `routing_table`
  (kopie wpisów użytkownika: static + connected), `find_next_hop(dest_ip)`
  (longest-prefix match jak w prawdziwym `Device`), `has_ip(ip)`.
- `SimLink`: `id`, `a`, `b`, adresy obu końców (`ip_a`/`mask_a`, `ip_b`/`mask_b`),
  `delay`, `bandwidth`, `weight`; `link.adjacency(node_id)` — to samo łącze widziane
  z danego końca (taka sama `Adjacency` jak z `neighbors`), `link.other(node_id)` —
  id drugiego końca.
- `snapshot.links[link_id]`, `snapshot.find_by_ip(ip)`, `snapshot.first_ip(node_id)`.

### `simulation/algorithm.py` — `RoutingAlgorithm` (Twój kontrakt)
Haki + metadane. Implementujesz `on_packet`; `on_init`/`on_timer` tylko gdy
masz control plane, a haki zmian topologii (`on_link_up`, `on_link_down`,
`on_link_changed`, `on_node_added`, `on_node_removed`) tylko gdy trzymasz wiedzę,
która po zmianie sieci może być nieaktualna — opis w sekcji 5a.

Opcje ustawiane w UI przed startem: lista `option_specs` w klasie. Każda opcja to
dict z `key`, `label`, `type` (`bool` albo `choice` z listą `choices`), `default`
i `description` (podpowiedź w UI). Sidebar rysuje je sam z
`GET /api/simulation/algorithms`, a w algorytmie czytasz gotowe, zwalidowane
wartości z `self.options[...]` (zła albo brakująca wartość = `default`).
Przykład: `algorithms/rip.py`. Algorytm, który legalnie działa bez końca
(timery okresowe), może podnieść bezpiecznik zdarzeń polem `max_events`.

### `simulation/engine.py` — `SimulationEngine`, `SimContext`, `SimConfig`, `Timer`
Silnik jest **pasywny**: `start()` (odpala `on_init`), `peek_time()`, `advance()`
(jedno zdarzenie), `inject_packet()`, `apply_topology()`. Nie ma własnego zegara — dzięki temu w testach
„przewijasz" świat pętlą, a na produkcji sesja nadaje mu tempo.

**Co silnik robi ZA Ciebie** (żebyś nie musiał):
- para `packet_sent`/`packet_recv` i doręczenie po `delay` ms,
- wykrycie, że pakiet **danych** doszedł do adresata (`packet_delivered`),
- automatyczne **echo reply** dla pingów + policzenie RTT,
- TTL: dekrementacja przy każdym forwardzie, drop `ttl_expired` po wyczerpaniu,
- bezpiecznik `max_events` (domyślnie 50 000) na wypadek nieskończonych pętli,
- `meta["prev_node"]` — skąd pakiet przyszedł.

**Czego silnik NIE robi** (bo to Twoja rola): nie wybiera łącza dla pakietu danych
i w ogóle nie rusza pakietów **kontrolnych** — one zawsze trafiają do `on_packet`.

`SimContext` — pełne API algorytmu:

| Wywołanie | Efekt |
|---|---|
| `ctx.now` | czas symulacji (ms) |
| `ctx.net` | `NetworkSnapshot` |
| `ctx.rng` | `random.Random(seed)` — **jedyne** dozwolone źródło losowości |
| `ctx.forward(node, packet, adj)` | wyślij pakiet łączem `adj`; dojdzie za `adj.delay` ms |
| `ctx.send_control(node, proto, payload, adj, summary=None)` | wyślij pakiet kontrolny do sąsiada (payload = dowolny dict); `summary` to krótki opis widoczny w logu UI, np. „Response: 4 trasy” |
| `ctx.drop(node, packet, reason)` | poddaj się (emituje `packet_dropped`) |
| `ctx.schedule_timer(node, delay, name, payload)` | za `delay` ms silnik wywoła `on_timer` tego węzła |
| `ctx.state(node)` | prywatny słownik węzła — Twoja pamięć (tablice, liczniki, LSDB…) |
| `ctx.table_update(node, rows)` | pokaż w UI nauczoną tablicę (rows = lista dictów) |
| `ctx.log(node, "...")` | linijka do logu w UI |
| `ctx.name(node_id)` | nazwa urządzenia do logów — działa też dla urządzenia usuniętego w trakcie symulacji |

### `simulation/registry.py` — `@register`
Rejestr algorytmów. `@register` na klasie + jedna linia importu w
`algorithms/__init__.py` → algorytm sam pojawia się w `GET /api/simulation/algorithms`
i w dropdownie UI. Zero innych zmian.

### `simulation/session.py` — `SimulationSession`
Warstwa transportowa (nie dotykasz jej pisząc algorytm): trzyma zegar
sim↔wall (`sim_now = kotwica + upłynęło·speed`), kolejkę komend klienta
(start/ping/pauza/krok/prędkość/stop) i wysyła zdarzenia po WebSockecie we
właściwym tempie. Protokół: design doc §8.

Przewijanie czasu bez ruchu (`skip_idle`, domyślnie włączone, checkbox w UI):
gdy żaden pakiet nie jest w drodze, a następne zdarzenie w kolejce to timer,
sesja czeka najwyżej 0,25 s i przeskakuje zegar do tego zdarzenia. Dzięki temu
timery z RFC (np. 30 s w RIP) nie wymagają skalowania, a pakiety nadal lecą w
zwykłym tempie.

Gdy użytkownik edytuje sieć w trakcie symulacji, endpoint REST po zapisaniu zmiany
woła `store.sync_simulations()`, a każda działająca sesja (`sync_topology`) buduje
nowy `NetworkSnapshot` i przekazuje go silnikowi (`apply_topology`) z bieżącym
czasem symulacji.

### Frontend
- `api/simulation_api.js` — `fetchAlgorithms()` + `SimulationSocket`
  (metody `start/ping/pause/resume/step/setSpeed/stop`, callbacki `onEvent/...`).
- `components/SimulationSidebar.jsx` — panel: algorytm, opcje, prędkość, sterowanie,
  status; posiada socket; wystawia `sendPing` przez `ref`.
- `hooks/useSimulationState.js` — stan symulacji po stronie UI: kropki pakietów,
  log, ostatnie `table_update` każdego węzła (podgląd tablic) i statystyki.
- Okrągłe przyciski w prawym górnym rogu kanwy (`SimPanelToggles`) otwierają panele
  po prawej: log zdarzeń, statystyki i edycję topologii (dodawanie urządzeń i łączy).
  Usuwanie: ✕ po najechaniu na urządzenie lub łącze, parametry łącza: dwuklik.
- Kliknięcie urządzenia w trybie Symuluj otwiera panel z jego **tablicą routingu z
  symulacji** (`SimRoutingTable` rysuje kolumny z kluczy wierszy, które wysyłasz w
  `ctx.table_update`, więc działa dla każdego algorytmu).

---

## 3. Życie pingu — prawdziwy timeline

Topologia `PC1 --10ms-- R1 --10ms-- PC2`, random walk. Klikasz PC1, potem PC2:

```
ping_sent  p1 (PC1→PC2)                      ← potwierdzenie wstrzyknięcia
t=12.1  packet_sent  p1  PC1→R1  ttl 63      ← PC1 nadał (a Ty: on_packet w PC1)
t=22.1  packet_recv  p1  PC1→R1              ← po 10 ms dotarł do R1
t=22.1  packet_sent  p1  R1→PC2  ttl 62      ← Twój on_packet w R1 wybrał łącze
t=32.1  packet_recv  p1  R1→PC2
t=32.1  packet_delivered p1 @PC2  icmp=request, elapsed=20   ← silnik wykrył cel
t=32.1  packet_sent  p2  PC2→R1  ttl 63      ← silnik stworzył echo reply p2
...reply wraca (routowany przez TWÓJ algorytm)...
t=52.1  packet_delivered p2 @PC1  icmp=reply, rtt=40, request_id=p1
```

Zwróć uwagę: żadnej trasy nie policzono z góry — każdy hop to osobne wywołanie
`on_packet` na węźle, który właśnie trzyma pakiet.

---

## 4. Jak dodać algorytm TRYWIALNY (checklist + wzorzec)

**Checklist (całość zmian w repo):**
1. Nowy plik `backend/simulation/algorithms/moj_algorytm.py`.
2. Klasa z `@register`, `name`, `display_name`, `description` i `on_packet`.
3. Jedna linia w `backend/simulation/algorithms/__init__.py`:
   `from . import moj_algorytm  # noqa: F401`.
4. Test w `backend/tests/` (wzorce niżej).
5. `docker compose run --rm --no-deps backend python -m pytest tests -q`.

**Wzorzec** (szkielet do skopiowania):

```python
from ..algorithm import RoutingAlgorithm
from ..registry import register


@register
class MojAlgorytm(RoutingAlgorithm):
    name = "moj_algorytm"          # klucz API (snake_case, unikalny)
    display_name = "Mój algorytm"  # nazwa w dropdownie
    description = "Jedno zdanie po polsku do UI."

    def on_packet(self, ctx, node, packet):
        options = ctx.net.neighbors(node.id)
        if not options:
            ctx.drop(node, packet, "dead_end")
            return
        adj = ...  # ← cała inteligencja algorytmu to wybór tego łącza
        ctx.forward(node, packet, adj)
```

Do dyspozycji przy wyborze: `adj.delay` (koszt), `adj.neighbor_id`,
`packet.meta` (własne notatki na pakiecie — przetrwają do następnego hopa),
`packet.dst_ip`/`dst_id`, `ctx.rng` (losowość), `node.find_next_hop(...)` (LPM
po tablicy użytkownika). Wzorcowa implementacja: `algorithms/random_walk.py`.

### Ćwiczenia (dobre na samodzielne pisanie)

**Hot potato** — „pozbądź się pakietu jak najszybciej": wybierz łącze o najmniejszym
`delay`, bez zawracania, jeśli jest wybór. Podpowiedź: `min(candidates,
key=lambda a: a.delay)`; remisy możesz rozstrzygać `ctx.rng`.

**Flooding** — wyślij pakiet **wszystkimi** łączami poza tym, którym przyszedł.
Dwie pułapki: (1) każda wysyłka to **`packet.copy()`** (wspólny obiekt = wspólny
TTL!); (2) bez tłumienia duplikatów zalejesz sieć — trzymaj w `ctx.state(node)`
zbiór widzianych `packet.id` i dropuj powtórki. Zauważ, że cel dostanie wiele
kopii → będzie wiele `delivered` i wiele odpowiedzi; to realistyczne, ale
przemyśl, czy chcesz to tłumić po stronie algorytmu.

**Tablicowy „static"** — użyj `node.find_next_hop(packet.dst_ip)`, potem znajdź
adjacencję, której `neighbor_ip == next_hop`; brak trasy → `ctx.drop(node,
packet, "no_route")`. To odwzoruje zachowanie pinga z ekranu Buduj, ale w żywym
świecie.

---

## 5. Jak dodać algorytm KONWERGENTNY (z pakietami kontrolnymi)

Anatomia: **control plane** (timery + pakiety kontrolne budują wiedzę w
`ctx.state(node)`) i **data plane** (`on_packet` dla `kind=="data"` forwarduje
po tej wiedzy). Silnik niczego nie wie o Twoim protokole — pakiety kontrolne
zawsze oddaje Tobie.

Szkielet distance-vector (RIP-podobny) — **celowo z dziurami do samodzielnego
uzupełnienia**:

```python
from ..algorithm import RoutingAlgorithm
from ..registry import register

ADVERTISE_INTERVAL = 3_000  # ms czasu symulacji


@register
class DistanceVector(RoutingAlgorithm):
    name = "distance_vector"
    display_name = "Distance vector (RIP-lite)"
    description = "Routery cyklicznie wymieniają wektory odległości."
    requires_convergence = True

    def on_init(self, ctx):
        # Każdy węzeł zaczyna od siebie: moje sieci w koszcie 0,
        # i planuje pierwszą rozgłoszkę (jitter, żeby nie szły w idealnym rytmie).
        for node in ctx.net.nodes.values():
            table = ctx.state(node)["dv"] = {}
            for ip, mask in node.ports:
                table[(ip, mask)] = (0, None)        # (koszt, next_hop_id)
            ctx.schedule_timer(node, ctx.rng.uniform(0, 500), "advertise")

    def on_timer(self, ctx, node, timer):
        if timer.name == "advertise":
            my_table = ctx.state(node)["dv"]
            for adj in ctx.net.neighbors(node.id):
                # TODO: wyślij swój wektor sąsiadowi. payload to zwykły dict —
                # np. {"routes": [[ip, mask, koszt], ...]}
                ctx.send_control(node, "dv", {...}, adj)
            # Świat żyje: przeplanuj kolejną rozgłoszkę.
            ctx.schedule_timer(node, ADVERTISE_INTERVAL, "advertise")

    def on_packet(self, ctx, node, packet):
        if packet.kind == "control":
            payload = packet.meta["payload"]          # to, co dał send_control
            sender = packet.src_id
            cost_to_sender = ...  # TODO: delay łącza, którym przyszedł (podpowiedź:
                                  # znajdź adjacencję z neighbor_id == sender)
            # TODO: Bellman-Ford — dla każdej trasy sąsiada sprawdź, czy
            # koszt_sąsiada + cost_to_sender < mój obecny koszt; jeśli tak,
            # zaktualizuj ctx.state(node)["dv"] i pokaż to w UI:
            #   ctx.table_update(node, [{"dest": ..., "mask": ..., "cost": ...,
            #                            "next_hop": ...}, ...])
            return

        # data plane: forwarduj po nauczonej tablicy
        # TODO: znajdź w ctx.state(node)["dv"] najlepszy wpis dla packet.dst_ip
        # (na początek wystarczy dokładne dopasowanie ip; LPM to bonus),
        # wyznacz adjacencję do next_hopa i ctx.forward(...).
        # Brak trasy → ctx.drop(node, packet, "no_route") — to też jest wynik!
```

**Rzeczy, o których łatwo zapomnieć:**

- `on_timer` musi **przeplanować sam siebie**, inaczej protokół umrze po jednej
  rundzie. To normalne, że kolejka nigdy nie jest pusta — świat ma żyć.
- Jitter startowy z `ctx.rng` (jak wyżej) — bez niego wszystkie routery nadają
  w idealnie tych samych chwilach, co wygląda nienaturalnie i maskuje wyścigi.
- Pakiet kontrolny idzie **do jednego sąsiada** (`send_control` na adjacencję).
  „Broadcast" = pętla po `ctx.net.neighbors(...)`.
- `ctx.state(node)` to **jedyne** miejsce na wiedzę węzła. Nie zapisuj niczego
  w `SimNode`/snapshocie (współdzielony, read-only) ani w polach klasy algorytmu
  (jedna instancja obsługuje wszystkie węzły!).
- Wysyłasz `ctx.table_update` przy każdej realnej zmianie — UI i przyszły panel
  tablic dostaną historię konwergencji za darmo.
- Pierwsze pingi możesz wysyłać zanim sieć się zbiegnie — `no_route`/drop to
  poprawny, ciekawy wynik do pokazania (i świetny materiał do pracy).
- Klasyczne problemy DV (count-to-infinity, split horizon) zostawiłem Tobie —
  to wdzięczny rozdział pracy inżynierskiej.

Pełna wersja tego szkieletu to `algorithms/rip.py` (RIPv2 wg RFC 2453: timery
30/180/120 s, aktualizacje wyzwalane, split horizon/poisoned reverse i
hold-down jako opcje), z testami w `tests/test_rip.py`.

---

## 5a. Zmiany topologii w trakcie symulacji

Użytkownik może w trakcie symulacji dodawać i usuwać urządzenia oraz łącza, zmieniać
parametry łączy, adresy interfejsów i trasy statyczne. Silnik porównuje starą i nową
kopię sieci i woła haki algorytmu w tej kolejności:

1. `on_link_down(ctx, link)` — łącze zniknęło: usunięte, usunięto jego urządzenie albo
   zmienił się adres któregoś końca. Pakiety, które nim leciały, są już porzucone
   (`packet_dropped`, powód `link_disconnected`).
2. `on_node_removed(ctx, node)` — urządzenie zniknęło (jego łącza przeszły już przez
   punkt 1). Zaraz po tym haku silnik kasuje `ctx.state(node)`, timery tego węzła i
   pakiety czekające w nim.
3. `on_node_added(ctx, node)` — nowe urządzenie (bez łączy, te przychodzą w punkcie 4).
4. `on_link_up(ctx, link)` — nowe łącze albo łącze z nowymi adresami.
5. `on_link_changed(ctx, link, previous)` — zmieniły się `delay`/`bandwidth`/`weight`,
   adresy bez zmian. Pakiety już w drodze dolatują po starym czasie, nowe po nowym.

Łącza są rozpoznawane po `id`: zmiana adresu to dla algorytmu „łącze padło i wstało
z nowymi adresami”. Przenumerowanie interfejsów routera (po usunięciu innego łącza)
nie jest zmianą. Gdy haki się wykonują, `ctx.net` pokazuje już **nową** sieć.

Kiedy coś implementować:

- Algorytmy trywialne (random walk, flooding, hot potato…) czytają
  `ctx.net.neighbors(...)` przy każdym hopie — nie potrzebują żadnego haka.
- Algorytm z wiedzą o sieci w `ctx.state` (tablice, LSDB, sąsiedzi) musi ją poprawić:
  backward learning zapomina trasy przez łącze, które zniknęło; RIP w `on_link_down`
  oznacza trasy przez to łącze metryką 16 i wysyła triggered update, a w `on_link_up`
  dodaje sieć podłączoną i wysyła Request do nowego sąsiada.
- Metryka zależna od `delay`/`bandwidth` (np. EIGRP) → przelicz koszty w
  `on_link_changed`.

RIP ma opcję **Wykrywanie awarii łącza**: „Natychmiast” (domyślnie, jak utrata
sygnału na interfejsie) albo „Cicha awaria” — wtedy `on_link_down` niczego nie
zmienia i routery dowiadują się dopiero po 180 s bez aktualizacji (jak w testach
count-to-infinity z `cut`).

W testach zmianę robi się tak jak sesja: zmodyfikuj prawdziwe obiekty
(`Device`/`Link`), zbuduj `NetworkSnapshot.from_db(...)` i wywołaj
`engine.apply_topology(snapshot, at=czas)` — przykłady w
`tests/test_dynamic_topology.py` i na końcu `tests/test_rip.py`.

---

## 6. Jak testować

### Pytest (bez Dockera-sieci, bez WS — czysty silnik)

Wzorce masz w `backend/tests/test_simulation.py` (`make_engine`, `drain`,
`by_type`, topologie `line`/`diamond`). Minimalny test nowego algorytmu:

```python
def test_moj_algorytm_dostarcza_ping():
    devices, links = diamond_topology()
    engine = make_engine(devices, links, get_algorithm("moj_algorytm"), seed=1)
    inject_ping(engine, devices[0].id, devices[-1].id, at_time=0.0)  # helper z test_simulation.py
    events = drain(engine)                     # przewiń świat do końca
    delivered = by_type(events, "packet_delivered")
    assert [d.payload["icmp"] for d in delivered] == ["request", "reply"]
```

Dla konwergentnych: po `engine.start()` **nie** wstrzykuj pingu od razu — najpierw
przewiń konwergencję pętlą `while engine.peek_time() is not None and
engine.peek_time() < 10_000: engine.advance()`, potem `inject_ping(engine, ..., at_time=10_000)`.
(Uwaga: `drain` w całości się nie skończy, bo timery działają wiecznie — przewijaj
do konkretnego czasu.)

Uruchamianie (zawsze przez Dockera):

```
docker compose run --rm --no-deps backend python -m pytest tests -q
```

### Ręcznie w aplikacji

`docker compose up -d` → http://localhost:5173 → zbuduj topologię → zakładka
**Symuluj** → wybierz algorytm → **Uruchom** → klikaj pary urządzeń i patrz w log.
Suwak prędkości działa na żywo; pauza + **Krok** pozwala oglądać zdarzenie po
zdarzeniu. Backend loguje wyjątki algorytmu jako `error` w panelu — nie wywalisz
aplikacji błędem w swoim kodzie.

---

## 7. Częste błędy (sekcja „dlaczego to nie działa")

| Objaw | Przyczyna |
|---|---|
| `error: ...` zaraz po pingu | wyjątek w Twoim `on_packet` — treść błędu jest w panelu |
| pakiety znikają bez `dropped` | `on_packet` nic nie zrobił z pakietem (zapomniany `ctx.forward`/`ctx.drop`) |
| wszystkie kopie floodingu „sklejone" | brak `packet.copy()` przy fan-oucie |
| `finished: limit zdarzeń` | pętla bez tłumienia duplikatów / timer bez końca emitujący pakiety |
| algorytm „widzi" cudzy stan | stan trzymany w polach klasy zamiast w `ctx.state(node)` |
| wyniki nie do powtórzenia | użyty `random` zamiast `ctx.rng` |
| po usunięciu łącza algorytm dalej wysyła tam pakiety | wiedza w `ctx.state` wskazuje na łącze, którego już nie ma — obsłuż `on_link_down` (sekcja 5a) |

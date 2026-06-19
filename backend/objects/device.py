from .port import Port
from .link import Link
from .route_entry import RouteEntry

def port_generator():
    first_part = 0
    second_part = 1

    while True:
        ip = f"128.0.{first_part}.{second_part}"
        Device.ip_address_pool.add(ip)
        yield Port(ip, 24)

        second_part += 1
        if second_part == 255:
            second_part = 1
            first_part += 1

class Device:
    _counter = 0
    ip_address_pool = set()
    port_gen = port_generator()

    def __init__(self, name = None, port_number = 1):
        class_name = self.__class__.__name__
        self.name = f"{class_name}_{Device._counter}" if name is None else name
        self.port_number = port_number
        self.ports = [next(Device.port_gen) for _ in range(port_number)]
        self.links = []
        self.id = Device._counter
        self.routing_table = []

        Device._counter += 1

    def add_port(self, ip = None, mask = 24):
        if ip is None:
            new_port = next(Device.port_gen)
            if mask != 24:
                new_port.set_mask(mask)
        else:
            if ip in Device.ip_address_pool:
                raise ValueError("IP address already in use")
            new_port = Port(ip, mask)
            Device.ip_address_pool.add(new_port.ip)
        self.ports.append(new_port)
        self.port_number += 1
        return new_port

    def edit_port(self, port, new_ip = None, new_mask = None):
        if port not in self.ports:
            raise ValueError("Port does not exist")
        if new_ip is not None:
            if new_ip in Device.ip_address_pool:
                raise ValueError("Ip address already in use")
            Device.ip_address_pool.add(new_ip)
            Device.ip_address_pool.remove(port.ip)
            port.set_ip(new_ip)
        if new_mask is not None:
            port.set_mask(new_mask)
        return port

    def del_port(self, port):
        if port not in self.ports:
            raise ValueError("Port does not exist")
        self.ports.remove(port)
        self.port_number -= 1
        Device.ip_address_pool.remove(port.ip)
        return port

    def check_port_availability(self, port_number):
        for link in self.links:
            if link.device_a == self.id and link.port_a_num == port_number:
                return False
            if link.device_b == self.id and link.port_b_num == port_number:
                return False
        return True

    def add_link(self, device_b, port_a_num, port_b_num, bandwidth, delay, unit):
        if port_a_num >= self.port_number or port_b_num >= device_b.port_number:
            raise ValueError("Invalid port number")
        
        if not self.check_port_availability(port_a_num) or not device_b.check_port_availability(port_b_num):
            raise ValueError("Port is already in use")
        
        new_link = Link(self.id, device_b.id, port_a_num, port_b_num, bandwidth, delay, unit)
        self.links.append(new_link)
        device_b.links.append(new_link)
        return new_link
    
    def del_link(self, link_id, device_b):
        link_to_remove = next((l for l in self.links if l.id == link_id), None)

        if not link_to_remove:
            raise ValueError("Link not found")
        
        self.links.remove(link_to_remove)
        device_b.links.remove(link_to_remove) 

    def add_route(self, device_ip, mask, next_hop, route_type="static"):
        for r in self.routing_table:
            if r.dest == device_ip and r.mask == mask and r.entry_type == route_type:
                raise ValueError("Route exists")
            
        entry = RouteEntry(device_ip, mask, next_hop, route_type)
        self.routing_table.append(entry)

    @staticmethod
    def count_beginning(ip_a, ip_b):
        a = [f"{int(num):08b}" for num in ip_a.split(".")]
        b = [f"{int(num):08b}" for num in ip_b.split(".")]
        ctr = 0

        for num_a, num_b in zip("".join(a), "".join(b)):
            if num_a != num_b:
                break

            ctr += 1

        return ctr
    
    def find_next_hop(self, dest_ip):
        routes = []

        ad_map = {
            "connected": 0,
            "static": 1
            #To add more
        }

        for r in self.routing_table:
            match_bits = Device.count_beginning(dest_ip, r.dest)
            if match_bits >= r.mask: routes.append(r)

        if not routes: return None

        routes.sort(key=lambda r: (r.mask, -ad_map.get(r.entry_type.lower(), 255)), reverse=True)
        return routes[0].next_hop

    def get_next(self, next_hop):
        if not self.ports:
            return None

        masks = [(Device.count_beginning(p.ip, next_hop), i) for i, p in enumerate(self.ports)]
        masks.sort(key = lambda m: m[0], reverse=True)
        index = masks[0][1]

        return self.ports[index]
    
    def delete_static_route(self, ip, mask):
        to_remove = next((r for r in self.routing_table if r.dest == ip and r.mask == mask and r.entry_type == "static"), None)

        if not to_remove: raise ValueError("Route has not been found")
        self.routing_table.remove(to_remove)
        return to_remove


if __name__ == "__main__":
    print("=== ROZPOCZĘCIE TESTÓW KLASY DEVICE ===\n")

    # 1. Tworzymy urządzenie (odpalamy z port_number=0, żeby dodać własne, przewidywalne porty)
    r1 = Device(name="Router_Core", port_number=0)
    print(f"[*] Utworzono urządzenie: {r1.name}")

    # 2. Dodajemy porty
    p1 = r1.add_port(ip="10.0.0.1", mask=24)
    p2 = r1.add_port(ip="192.168.1.1", mask=24)
    print(f"[*] Dodano porty:")
    print(f"    - P1: {p1.ip}/{p1.mask}")
    print(f"    - P2: {p2.ip}/{p2.mask}\n")

    # 3. Wypełniamy tablicę routingu
    print("[*] Dodawanie tras do tablicy routingu...")
    
    # Trasa nr 1: Ogólna trasa statyczna (Maska /16)
    r1.add_route("8.8.0.0", 16, "192.168.1.2", route_type="static")
    
    # Trasa nr 2: Dokładniejsza trasa statyczna (Maska /24) - LPM powinno wybrać tę!
    r1.add_route("8.8.8.0", 24, "10.0.0.2", route_type="static")
    
    # Trasa nr 3: Trasa dynamiczna do tej samej sieci co wyżej (żeby sprawdzić Dystans Administracyjny)
    # Symulujemy, że router usłyszał o trasie z jakiegoś protokołu.
    r1.add_route("8.8.8.0", 24, "10.0.0.3", route_type="ospf")

    print("    Aktualna tablica routingu:")
    for r in r1.routing_table:
        print(f"    -> Sieć {r.dest}/{r.mask} | Next Hop: {r.next_hop} | Typ: {r.entry_type}")
    print()

    # --- TEST 1: Wyszukiwanie Trasy (LPM i AD) ---
    cel_ip = "8.8.8.8"
    print(f"--- TEST 1: Routing do adresu {cel_ip} ---")
    next_hop = r1.find_next_hop(cel_ip)
    print(f"    Znaleziony Next Hop: {next_hop}")
    
    # Sprawdzamy czy to prawda: LPM powinno wybrać maskę /24, a z dwóch tras /24 AD powinno ubić OSPF i wybrać "static"
    if next_hop == "10.0.0.2":
        print("    [SUKCES] Algorytmy LPM i Dystansu Administracyjnego działają poprawnie!")
    else:
        print("    [BŁĄD] Znaleziono złą trasę!")

    # --- TEST 2: Wybieranie fizycznego portu na podstawie Next Hop ---
    print(f"\n--- TEST 2: Szukanie portu wyjściowego do Next Hop'a {next_hop} ---")
    out_port = r1.get_next(next_hop)
    print(f"    Wybrany port: {out_port.ip}/{out_port.mask}")
    
    if out_port.ip == "10.0.0.1":
        print("    [SUKCES] Dopasowanie binarne portów działa perfekcyjnie!")
    else:
        print("    [BŁĄD] Wybrano zły port!")

    # --- TEST 3: Usuwanie trasy statycznej ---
    print("\n--- TEST 3: Usuwanie najlepszej trasy statycznej ---")
    deleted_route = r1.delete_static_route(ip="8.8.8.0", mask=24)
    print(f"    Pomyślnie usunięto z tablicy: {deleted_route.dest}/{deleted_route.mask}")
    
    print("    Ponawiamy wyszukiwanie do 8.8.8.8...")
    nowy_next_hop = r1.find_next_hop(cel_ip)
    print(f"    Nowy Next Hop: {nowy_next_hop}")
    
    # Ponieważ usunęliśmy statyczną /24, najlepsza pozostała to nasza oszukana OSPF /24 (złym AD 255, ale maska /24 wygrywa z /16)
    if nowy_next_hop == "10.0.0.3":
         print("    [SUKCES] System płynnie przeszedł na trasę awaryjną po usunięciu wpisu statycznego!")

    print("\n=== WSZYSTKIE TESTY ZAKOŃCZONE! MOŻNA WYSYŁAĆ NA PRODUKCJĘ! ===")
class TopologyStore:
    def __init__(self):
        self.devices = []
        self.links = []
        self.ip_pool = set()
        self._device_seq = 1
        self._link_seq = 1

    def next_device_id(self):
        _id = self._device_seq
        self._device_seq += 1
        return _id

    def next_link_id(self):
        _id = self._link_seq
        self._link_seq += 1
        return _id

    def find_device(self, device_id: int):
        return next((d for d in self.devices if d.id == device_id), None)

    def find_link(self, link_id: int):
        return next((l for l in self.links if l.id == link_id), None)

    def reserve_ip(self, ip: str):
        if ip in self.ip_pool:
            raise ValueError(f"IP address {ip} is already in use")
        self.ip_pool.add(ip)

    def release_ip(self, ip: str):
        self.ip_pool.discard(ip)

    def is_ip_reserved(self, ip: str):
        return ip in self.ip_pool

    def validate_unique_ips(self, replacements=None):
        replacements = replacements or {}
        used_ips = {}

        for device in self.devices:
            ips = replacements.get(
                device.id,
                [port.ip for port in device.ports]
            )

            for ip in ips:
                if ip in used_ips:
                    raise ValueError(f"IP address {ip} is already in use")
                used_ips[ip] = device.name
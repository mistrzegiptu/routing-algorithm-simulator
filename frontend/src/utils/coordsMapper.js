export function mapCordsCircular(devices, spawn = { x: 400, y: 400 }) {
    const radius = Math.max(150, devices.length * 30)
        
    return devices.map((d, index) => {
        const angle = (index / devices.length) * 2 * Math.PI;
        return {
            ...d,
            x: spawn.x + radius * Math.cos(angle) - 48,
            y: spawn.y + radius * Math.sin(angle) - 30,
        };
    });
} 

export function getNewCords(existingCount, spawn = { x: 400, y: 400 }) {
    const jitter = (existingCount % 6) * 24 - 60;

      if (spawn) {
        return {
          x: spawn.x - 48 + jitter,
          y: spawn.y - 30 + jitter,
        };
      }

      const x = 80 + (existingCount % 5) * 200;
      const y = 80 + Math.floor(existingCount / 5) * 180;
      return { x, y };
}
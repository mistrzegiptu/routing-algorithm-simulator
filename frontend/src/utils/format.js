// Display helpers for device interfaces.

export function portCidr(port) {
  if (!port || !port.ip) return null;
  const mask = port.mask ?? 24;
  return `${port.ip}/${mask}`;
}

export function deviceCidr(device, portIndex = 0) {
  return portCidr(device?.ports?.[portIndex]);
}

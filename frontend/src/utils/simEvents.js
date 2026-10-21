export function formatSimTime(t) {
  return t < 1000 ? `${Math.round(t)} ms` : `${(t / 1000).toFixed(2).replace(".", ",")} s`;
}

const LINK_PARAM_LABELS = {
  delay: "opóźnienie",
  bandwidth: "przepustowość",
  unit: "jednostka",
  weight: "waga",
};

function linkLabel(ev, nameOf) {
  const p = ev.payload || {};
  return `${p.a_name ?? nameOf(ev.from_id)} ↔ ${p.b_name ?? nameOf(ev.to_id)}`;
}

function describeLinkChange(before = {}, after = {}) {
  return Object.keys(after)
    .filter((key) => before[key] !== after[key])
    .map((key) => `${LINK_PARAM_LABELS[key] ?? key} ${before[key] ?? "—"} → ${after[key] ?? "—"}`)
    .join(", ");
}

function formatTopologyChange(ev, nameOf) {
  const p = ev.payload || {};
  switch (p.change) {
    case "link_down":
      return `Łącze ${linkLabel(ev, nameOf)} rozłączone`;
    case "link_up":
      return `Łącze ${linkLabel(ev, nameOf)} połączone`;
    case "link_changed":
      return `Zmieniono łącze ${linkLabel(ev, nameOf)}: ${describeLinkChange(p.before, p.after)}`;
    case "node_added":
      return `Dodano urządzenie ${p.name ?? nameOf(ev.node_id)}`;
    case "node_removed":
      return `Usunięto urządzenie ${p.name ?? nameOf(ev.node_id)}`;
    default:
      return null;
  }
}

export function formatEvent(ev, nameOf) {
  const t = formatSimTime(ev.t);
  const p = ev.payload || {};
  switch (ev.type) {
    case "packet_sent":
      return {
        text: `[${t}] ${nameOf(ev.from_id)} → ${nameOf(ev.to_id)} (${ev.protocol}${p.summary ? ` · ${p.summary}` : ""})`,
      };
    case "packet_delivered":
      if (p.icmp === "reply") {
        return {
          text: `[${t}] ✓ Odpowiedź wróciła do ${nameOf(ev.node_id)} — RTT ${Math.round(p.rtt)} ms`,
          tone: "good",
        };
      }
      if (p.icmp === "request") {
        return {
          text: `[${t}] ✓ Ping dotarł do ${nameOf(ev.node_id)} (${Math.round(p.elapsed)} ms)`,
          tone: "good",
        };
      }
      return { text: `[${t}] ✓ Dostarczono do ${nameOf(ev.node_id)}`, tone: "good" };
    case "packet_dropped":
      if (p.reason === "link_disconnected") {
        return {
          text: `[${t}] ✗ Pakiet porzucono na łączu ${nameOf(ev.from_id)} → ${nameOf(ev.to_id)} (łącze usunięte)`,
          tone: "bad",
        };
      }
      if (p.reason === "node_removed") {
        return { text: `[${t}] ✗ Pakiet porzucono (urządzenie usunięte)`, tone: "bad" };
      }
      return { text: `[${t}] ✗ Porzucono w ${nameOf(ev.node_id)} (${p.reason ?? "?"})`, tone: "bad" };
    case "table_update":
      return { text: `[${t}] Tablica routingu: ${nameOf(ev.node_id)}` };
    case "node_log":
      return { text: `[${t}] ${nameOf(ev.node_id)}: ${p.message ?? ""}` };
    case "topology_change": {
      const text = formatTopologyChange(ev, nameOf);
      return text ? { text: `[${t}] ${text}`, tone: "topo" } : null;
    }
    default:
      return null;
  }
}

import { formatSimTime } from "../utils/simEvents.js";
import "./SimRoutingTable.css";

const COLUMN_LABELS = {
  dest: "Sieć",
  dest_name: "Cel",
  metric: "Metryka",
  cost: "Koszt",
  next_hop: "Next hop",
  next_hop_name: "Next hop",
  interface: "Interfejs",
  type: "Źródło",
  state: "Stan",
};

const STATE_LABELS = {
  connected: "podłączona",
  valid: "aktywna",
  hold_down: "hold-down",
  garbage_collection: "usuwanie",
};

const UNREACHABLE_METRIC = 16;

function columnsOf(routes) {
  const keys = [];
  for (const row of routes) {
    for (const key of Object.keys(row)) {
      if (!keys.includes(key) && !key.endsWith("_id")) keys.push(key);
    }
  }
  return keys.filter((key) =>
    !(key === "next_hop_name" && keys.includes("next_hop")) &&
    !(key === "type" && keys.includes("state")));
}

function renderCell(key, row) {
  const value = row[key];
  if (key === "next_hop") {
    if (!value) return "—";
    return (
      <>
        {value}
        {row.next_hop_name && <span className="sim-table__sub">{row.next_hop_name}</span>}
      </>
    );
  }
  if (key === "state") {
    return <span className={`sim-table__state sim-table__state--${value}`}>{STATE_LABELS[value] ?? value}</span>;
  }
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function SimRoutingTable({ table }) {
  if (!table) {
    return (
      <p className="empty-text">
        To urządzenie nie ma tablicy w tej symulacji. Tablice budują np. routery w RIPv2
        albo wszystkie węzły w backward learning.
      </p>
    );
  }
  if (table.routes.length === 0) {
    return <p className="empty-text">Tablica jest pusta.</p>;
  }

  const columns = columnsOf(table.routes);
  return (
    <>
      <div className="sim-table-wrap">
        <table className="routing-table sim-table">
          <thead>
            <tr>
              {columns.map((key) => <th key={key}>{COLUMN_LABELS[key] ?? key}</th>)}
            </tr>
          </thead>
          <tbody>
            {table.routes.map((row, index) => (
              <tr
                key={row.dest ?? row.dest_id ?? index}
                className={row.metric >= UNREACHABLE_METRIC ? "sim-table__row--unreachable" : ""}
              >
                {columns.map((key) => <td key={key}>{renderCell(key, row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sim-table__time">Ostatnia zmiana: {formatSimTime(table.t)}</p>
    </>
  );
}

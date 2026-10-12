import type { SessionRow } from "./repo";

function csvCell(value: string | number | null) {
  if (value === null) return "";
  const text = String(value);
  // Quote, and neutralise spreadsheet formula injection from task titles.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) || safe !== text ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Session log as CSV; times are ISO 8601 UTC. */
export function sessionsToCsv(rows: SessionRow[]): string {
  const header = ["date", "started_at", "type", "status", "task", "planned_minutes", "actual_minutes"];
  const lines = rows.map((s) =>
    [
      s.localDate,
      new Date(s.startedAt).toISOString(),
      s.type,
      s.status,
      s.taskTitle,
      (s.plannedSeconds / 60).toFixed(1),
      (s.actualSeconds / 60).toFixed(1),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

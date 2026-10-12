import type { NextRequest } from "next/server";
import { badRequest } from "@/lib/http";
import { exportSessions, isIsoDate } from "@/lib/repo";

function csvCell(value: string | number | null) {
  if (value === null) return "";
  const text = String(value);
  // Quote, and neutralise spreadsheet formula injection from task titles.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) || safe !== text ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** GET /api/report/export?from=YYYY-MM-DD&to=YYYY-MM-DD — sessions as CSV. */
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if (!isIsoDate(from) || !isIsoDate(to)) return badRequest("from and to must be YYYY-MM-DD");

  const header = ["date", "started_at", "type", "status", "task", "planned_minutes", "actual_minutes"];
  const lines = exportSessions(from, to).map((s) =>
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

  return new Response([header.join(","), ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pomodoro-${from}-to-${to}.csv"`,
    },
  });
}

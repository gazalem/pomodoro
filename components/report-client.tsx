"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { sessionsToCsv } from "@/lib/csv";
import { useDatabase } from "@/lib/db/browser";
import { downloadBlob } from "@/lib/download";
import { datesBetween, isIsoDate, type Report } from "@/lib/repo";
import { shiftDate, useToday } from "@/lib/use-now";
import { ReportView } from "./report-view";

/** Resolves ?from=&to= (default: the last 7 days), capped at one year. */
function useRange(): { from: string; to: string } | null {
  const params = useSearchParams();
  const today = useToday();
  if (!today) return null;
  let from = params.get("from");
  let to = params.get("to");
  if (!isIsoDate(to)) to = today;
  if (!isIsoDate(from)) from = shiftDate(to, -6);
  if (from > to) [from, to] = [to, from];
  const span = datesBetween(from, to);
  if (span.length >= 366) from = span.at(-366) ?? from;
  return { from, to };
}

export function ReportClient() {
  const state = useDatabase();
  const range = useRange();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const from = range?.from;
  const to = range?.to;

  useEffect(() => {
    if (state.status !== "ready" || !from || !to) return;
    let active = true;
    state.db.repo.getReport(from, to).then(
      (r) => active && setReport(r),
      (e: unknown) => active && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      active = false;
    };
  }, [state, from, to]);

  if (state.status === "error" || error) {
    return <Message>Couldn&apos;t open your data: {state.status === "error" ? state.message : error}</Message>;
  }
  if (state.status === "waiting") {
    return <Message>Pomodoro is open in another tab. Close it to see your report here.</Message>;
  }
  if (state.status !== "ready" || !report) return <Message>Loading report…</Message>;

  const exportCsv = async () => {
    const rows = await state.db.repo.exportSessions(report.from, report.to);
    downloadBlob(new Blob([sessionsToCsv(rows)], { type: "text/csv;charset=utf-8" }), `pomodoro-${report.from}-to-${report.to}.csv`);
  };

  return <ReportView report={report} onExport={() => void exportCsv()} />;
}

function Message({ children }: { children: ReactNode }) {
  return <p className="py-20 text-center text-ink-soft dark:text-mist-soft">{children}</p>;
}

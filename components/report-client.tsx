"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { sessionsToCsv } from "@/lib/csv";
import { useDatabase } from "@/lib/db/browser";
import { downloadBlob } from "@/lib/download";
import { datesBetween, isIsoDate, type ExerciseReport, type Report } from "@/lib/repo";
import { shiftDate, useToday } from "@/lib/use-now";
import { ExerciseReportView } from "./exercise-report-view";
import { ReportView } from "./report-view";

type View = "focus" | "exercise";

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
  const view: View = useSearchParams().get("view") === "exercise" ? "exercise" : "focus";
  const [report, setReport] = useState<Report | null>(null);
  const [exerciseReport, setExerciseReport] = useState<ExerciseReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const from = range?.from;
  const to = range?.to;

  useEffect(() => {
    if (state.status !== "ready" || !from || !to) return;
    let active = true;
    const fail = (e: unknown) => active && setError(e instanceof Error ? e.message : String(e));
    if (view === "exercise") state.db.repo.getExerciseReport(from, to).then((r) => active && setExerciseReport(r), fail);
    else state.db.repo.getReport(from, to).then((r) => active && setReport(r), fail);
    return () => {
      active = false;
    };
  }, [state, from, to, view]);

  if (state.status === "error" || error) {
    return <Message>Couldn&apos;t open your data: {state.status === "error" ? state.message : error}</Message>;
  }
  if (state.status === "waiting") {
    return <Message>Pomodoro is open in another tab. Close it to see your report here.</Message>;
  }
  const tabs = <ReportTabs view={view} from={from} to={to} />;
  if (view === "exercise") {
    if (state.status !== "ready" || !exerciseReport) return <>{tabs}<Message>Loading report…</Message></>;
    return (
      <>
        {tabs}
        <ExerciseReportView report={exerciseReport} />
      </>
    );
  }
  if (state.status !== "ready" || !report) return <>{tabs}<Message>Loading report…</Message></>;

  const exportCsv = async () => {
    const rows = await state.db.repo.exportSessions(report.from, report.to);
    downloadBlob(new Blob([sessionsToCsv(rows)], { type: "text/csv;charset=utf-8" }), `pomodoro-${report.from}-to-${report.to}.csv`);
  };

  return (
    <>
      {tabs}
      <ReportView report={report} onExport={() => void exportCsv()} />
    </>
  );
}

/** Focus / Exercise switch; keeps the selected date range. */
function ReportTabs({ view, from, to }: { view: View; from?: string; to?: string }) {
  const range = from && to ? `from=${from}&to=${to}` : "";
  const tab = (value: View, label: string, href: string) => (
    <Link
      href={href}
      aria-current={view === value ? "page" : undefined}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
        view === value
          ? "bg-ink text-paper dark:bg-mist dark:text-night"
          : "text-ink-soft hover:text-ink dark:text-mist-soft dark:hover:text-mist"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Report" className="mb-5 flex w-fit rounded-full border border-ink/10 p-1 dark:border-mist/15">
      {tab("focus", "Focus", `/report${range ? `?${range}` : ""}`)}
      {tab("exercise", "Exercise", `/report?view=exercise${range ? `&${range}` : ""}`)}
    </nav>
  );
}

function Message({ children }: { children: ReactNode }) {
  return <p className="py-20 text-center text-ink-soft dark:text-mist-soft">{children}</p>;
}

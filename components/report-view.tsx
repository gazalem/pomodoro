"use client";

import type { CSSProperties, ReactNode } from "react";
import { CATEGORY_HEX, type CategoryColor } from "@/lib/categories";
import { formatDuration, formatTimeOfDay } from "@/lib/format";
import type { Report } from "@/lib/repo";
import type { PhaseType, SessionStatus } from "@/lib/types";
import { ColumnChart, type Column } from "./column-chart";
import { DownloadIcon } from "./icons";
import { RangePicker } from "./range-picker";

const WEEKDAY = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });
const SHORT_DATE = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const LONG_DATE = new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

const asUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);

function hourLabel(hour: number) {
  const suffix = hour < 12 ? "am" : "pm";
  return `${hour % 12 === 0 ? 12 : hour % 12}${suffix}`;
}

export function ReportView({ report, onExport }: { report: Report; onExport: () => void }) {
  const { totals, days, dailyGoal } = report;
  const completionRate = totals.focusAttempts > 0 ? Math.round((totals.pomodoros / totals.focusAttempts) * 100) : null;
  const avgFocus = totals.activeDays > 0 ? totals.focusSeconds / totals.activeDays : 0;

  const labelEvery = days.length <= 7 ? 1 : days.length <= 14 ? 2 : Math.ceil(days.length / 6);
  const dayColumns: Column[] = days.map((d, i) => ({
    key: d.date,
    label: i % labelEvery === 0 ? (days.length <= 7 ? WEEKDAY.format(asUtc(d.date)) : SHORT_DATE.format(asUtc(d.date))) : "",
    title: LONG_DATE.format(asUtc(d.date)),
    value: d.pomodoros,
    display: `${d.pomodoros} pomodoro${d.pomodoros === 1 ? "" : "s"} · ${formatDuration(d.focusSeconds)}`,
  }));

  // Show working hours, widened to include any hour that has data.
  const withData = report.hours.filter((h) => h.pomodoros > 0).map((h) => h.hour);
  const firstHour = Math.min(7, ...withData);
  const lastHour = Math.max(18, ...withData);
  const hourColumns: Column[] = report.hours
    .filter((h) => h.hour >= firstHour && h.hour <= lastHour)
    .map((h) => ({
      key: String(h.hour),
      label: h.hour % 3 === 0 ? hourLabel(h.hour) : "",
      title: `${hourLabel(h.hour)} – ${hourLabel((h.hour + 1) % 24)}`,
      value: h.pomodoros,
      display: `${h.pomodoros} pomodoro${h.pomodoros === 1 ? "" : "s"}`,
    }));
  const bestHour = report.hours.reduce((best, h) => (h.pomodoros > best.pomodoros ? h : best), report.hours[0]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangePicker from={report.from} to={report.to} />
        <button
          type="button"
          onClick={onExport}
          className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3.5 py-1.5 text-sm font-medium hover:bg-ink/5 dark:border-mist/15 dark:hover:bg-mist/10"
        >
          <DownloadIcon /> Export CSV
        </button>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
        <Card className="col-span-2 lg:row-span-2 lg:flex lg:flex-col lg:justify-center">
          <p className="text-sm text-ink-soft dark:text-mist-soft">Focus time</p>
          <p className="text-5xl font-semibold tracking-tight md:text-6xl">{formatDuration(totals.focusSeconds)}</p>
          <p className="mt-2 text-sm text-ink-soft dark:text-mist-soft">
            {totals.activeDays > 0
              ? `${formatDuration(avgFocus)} per active day · ${totals.activeDays} of ${days.length} day${days.length === 1 ? "" : "s"} active`
              : "No focus sessions in this range yet."}
          </p>
        </Card>
        <Stat label="Pomodoros completed" value={totals.pomodoros.toLocaleString()} />
        <Stat
          label="Days on goal"
          value={`${totals.goalDays}/${days.length}`}
          hint={`Goal: ${dailyGoal} pomodoros a day`}
        />
        <Stat
          label="Focus completion"
          value={completionRate === null ? "–" : `${completionRate}%`}
          hint={totals.focusAttempts > 0 ? `${totals.pomodoros} of ${totals.focusAttempts} focus blocks finished` : undefined}
        />
        <Stat
          label="Tasks completed"
          value={totals.tasksCompleted.toLocaleString()}
          hint={`${formatDuration(totals.breakSeconds)} on breaks · ${totals.skippedBreaks} skipped`}
        />
      </section>

      <Card>
        <h2 className="font-semibold">Pomodoros per day</h2>
        <p className="mb-4 text-sm text-ink-soft dark:text-mist-soft">Completed focus blocks; the line is your daily goal.</p>
        <ColumnChart
          columns={dayColumns}
          reference={{ value: dailyGoal, label: `Goal ${dailyGoal}` }}
          ariaLabel="Pomodoros completed per day"
        />
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-ink-soft dark:text-mist-soft">Show as table</summary>
          <table className="mt-2 w-full text-left tabular-nums">
            <thead className="text-ink-soft dark:text-mist-soft">
              <tr>
                <th className="py-1 font-medium">Day</th>
                <th className="py-1 text-right font-medium">Pomodoros</th>
                <th className="py-1 text-right font-medium">Focus</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-t border-ink/10 dark:border-mist/10">
                  <td className="py-1">{LONG_DATE.format(asUtc(d.date))}</td>
                  <td className="py-1 text-right">{d.pomodoros}</td>
                  <td className="py-1 text-right">{formatDuration(d.focusSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <Card>
        <h2 className="font-semibold">Focus by category</h2>
        <p className="mb-4 text-sm text-ink-soft dark:text-mist-soft">
          Where your focus time went, by each task&apos;s category.
        </p>
        <CategoryBreakdown categories={report.categories} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">When you focus</h2>
          <p className="mb-4 text-sm text-ink-soft dark:text-mist-soft">
            {bestHour.pomodoros > 0
              ? `Most productive hour: ${hourLabel(bestHour.hour)} – ${hourLabel((bestHour.hour + 1) % 24)}.`
              : "Completed focus blocks by starting hour."}
          </p>
          <ColumnChart columns={hourColumns} ariaLabel="Completed pomodoros by hour of day" />
        </Card>

        <Card>
          <h2 className="font-semibold">Tasks</h2>
          <p className="mb-3 text-sm text-ink-soft dark:text-mist-soft">Pomodoros spent compared with your estimate.</p>
          {report.tasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-soft dark:text-mist-soft">
              No task activity in this range. Pick a task before focusing to track it here.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-ink/10 dark:divide-mist/10">
              {report.tasks.map((t) => (
                <TaskLine key={t.id} task={t} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">Session log</h2>
        {report.recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft dark:text-mist-soft">No sessions recorded in this range.</p>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm tabular-nums">
              <thead className="text-ink-soft dark:text-mist-soft">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Started</th>
                  <th className="px-2 py-1.5 font-medium">Phase</th>
                  <th className="px-2 py-1.5 font-medium">Task</th>
                  <th className="px-2 py-1.5 text-right font-medium">Time</th>
                  <th className="px-2 py-1.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {report.recent.map((s) => (
                  <tr key={s.id} className="border-t border-ink/10 dark:border-mist/10">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <LocalTime ms={s.startedAt} date={s.localDate} />
                    </td>
                    <td className="px-2 py-1.5">{PHASE_NAMES[s.type]}</td>
                    <td className="max-w-[16rem] truncate px-2 py-1.5">{s.taskTitle ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">{formatDuration(s.actualSeconds)}</td>
                    <td className="px-2 py-1.5">{STATUS_NAMES[s.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {report.recent.length >= 40 && (
          <p className="mt-2 text-xs text-ink-soft dark:text-mist-soft">Showing the latest 40. Export CSV for the full log.</p>
        )}
      </Card>
    </div>
  );
}

const PHASE_NAMES: Record<PhaseType, string> = {
  focus: "Focus",
  short_break: "Short break",
  long_break: "Long break",
  lunch: "Lunch",
};

const STATUS_NAMES: Record<SessionStatus, string> = {
  completed: "Completed",
  skipped: "Skipped",
  stopped: "Stopped early",
};

function LocalTime({ ms, date }: { ms: number; date: string }) {
  return (
    <time dateTime={new Date(ms).toISOString()}>
      {SHORT_DATE.format(asUtc(date))}, {formatTimeOfDay(ms)}
    </time>
  );
}

function TaskLine({ task }: { task: Report["tasks"][number] }) {
  const ratio = task.estimated > 0 ? task.spentTotal / task.estimated : 0;
  const over = task.spentTotal > task.estimated;
  return (
    <li className="flex flex-col gap-1.5 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`truncate ${task.done ? "text-ink-soft line-through dark:text-mist-soft" : ""}`}>{task.title}</span>
          {task.categoryName && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-ink-soft dark:text-mist-soft">
              <Swatch color={task.categoryColor} className="size-2" />
              {task.categoryName}
            </span>
          )}
        </span>
        <span className="shrink-0 text-sm text-ink-soft tabular-nums dark:text-mist-soft">
          {task.spentInRange} in range · {task.spentTotal}/{task.estimated} total
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-tomato/15" aria-hidden="true">
        <div className="h-full rounded-full bg-tomato-deep dark:bg-tomato" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      {over && <span className="text-xs text-ink-soft dark:text-mist-soft">Over estimate by {task.spentTotal - task.estimated}</span>}
    </li>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-ink/10 bg-white p-4 md:p-5 dark:border-mist/10 dark:bg-night-raised ${className}`}>
      {children}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-sm text-ink-soft dark:text-mist-soft">{label}</p>
      <p className="mt-1 text-2xl font-semibold md:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-soft dark:text-mist-soft">{hint}</p>}
    </Card>
  );
}

/** A category's identity color, stepped for light and dark surfaces; hollow for "Uncategorized". */
function Swatch({ color, className = "" }: { color: CategoryColor | null; className?: string }) {
  if (!color) {
    return <span aria-hidden="true" className={`inline-block shrink-0 rounded-full border-[1.5px] border-ink-soft/60 dark:border-mist-soft/60 ${className}`} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full bg-[var(--c)] dark:bg-[var(--c-dark)] ${className}`}
      style={{ "--c": CATEGORY_HEX[color].light, "--c-dark": CATEGORY_HEX[color].dark } as CSSProperties}
    />
  );
}

/**
 * One bar per category, largest first. Every row carries its name and values
 * as text, so identity never depends on color alone.
 */
function CategoryBreakdown({ categories }: { categories: Report["categories"] }) {
  if (categories.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-ink-soft dark:text-mist-soft">
        No focus time in this range yet. Give your tasks a category to see the split here.
      </p>
    );
  }
  const total = categories.reduce((sum, c) => sum + c.focusSeconds, 0);
  const max = Math.max(...categories.map((c) => c.focusSeconds));

  return (
    <ul className="flex flex-col gap-3">
      {categories.map((c) => {
        const share = total > 0 ? Math.round((c.focusSeconds / total) * 100) : 0;
        const style = c.color
          ? ({ "--c": CATEGORY_HEX[c.color].light, "--c-dark": CATEGORY_HEX[c.color].dark } as CSSProperties)
          : undefined;
        return (
          <li key={c.categoryId ?? "none"} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <Swatch color={c.color} className="size-2.5" />
                <span className="truncate">{c.name}</span>
              </span>
              <span className="shrink-0 text-ink-soft tabular-nums dark:text-mist-soft">
                {formatDuration(c.focusSeconds)} · {c.pomodoros} pomodoro{c.pomodoros === 1 ? "" : "s"} · {share}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-ink/[0.06] dark:bg-mist/10" aria-hidden="true">
              <div
                className={`h-full rounded-full ${c.color ? "bg-[var(--c)] dark:bg-[var(--c-dark)]" : "bg-ink/30 dark:bg-mist/30"}`}
                style={{ ...style, width: `${Math.max(2, (c.focusSeconds / max) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

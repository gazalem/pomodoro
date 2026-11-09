"use client";

import { formatDuration } from "@/lib/format";
import type { ExerciseReport } from "@/lib/repo";
import { ColumnChart, type Column } from "./column-chart";
import { RangePicker } from "./range-picker";
import { asUtc, Card, LONG_DATE, SHORT_DATE, Stat, WEEKDAY } from "./report-view";

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

export function ExerciseReportView({ report }: { report: ExerciseReport }) {
  const { totals, days } = report;
  const labelEvery = days.length <= 7 ? 1 : days.length <= 14 ? 2 : Math.ceil(days.length / 6);
  const columns: Column[] = days.map((d, i) => ({
    key: d.date,
    label: i % labelEvery === 0 ? (days.length <= 7 ? WEEKDAY.format(asUtc(d.date)) : SHORT_DATE.format(asUtc(d.date))) : "",
    title: LONG_DATE.format(asUtc(d.date)),
    value: d.sets,
    display: `${plural(d.sets, "set")} · ${formatDuration(d.activeSeconds)}`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <RangePicker from={report.from} to={report.to} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Exercise summary">
        <Card className="col-span-2 lg:row-span-2 lg:flex lg:flex-col lg:justify-center">
          <p className="text-sm text-ink-soft dark:text-mist-soft">Exercise time</p>
          <p className="text-5xl font-semibold tracking-tight md:text-6xl">{formatDuration(totals.activeSeconds)}</p>
          <p className="mt-2 text-sm text-ink-soft dark:text-mist-soft">
            {totals.activeDays > 0
              ? `${totals.activeDays} of ${days.length} day${days.length === 1 ? "" : "s"} active · ${formatDuration(totals.restSeconds)} resting`
              : "No workouts in this range yet."}
          </p>
        </Card>
        <Stat label="Sets completed" value={totals.sets.toLocaleString()} />
        <Stat label="Repetitions" value={totals.reps.toLocaleString()} hint="From repetition sets" />
        <Stat label="Exercises finished" value={totals.exercisesCompleted.toLocaleString()} hint="All sets of an exercise done" />
        <Stat
          label="Avg per active day"
          value={totals.activeDays > 0 ? formatDuration(totals.activeSeconds / totals.activeDays) : "–"}
        />
      </section>

      <Card>
        <h2 className="font-semibold">Sets per day</h2>
        <p className="mb-4 text-sm text-ink-soft dark:text-mist-soft">Completed exercise sets.</p>
        <ColumnChart columns={columns} ariaLabel="Exercise sets completed per day" barClassName="bg-teal dark:bg-teal-bright" />
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">By exercise</h2>
        {report.exercises.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft dark:text-mist-soft">No exercise sets recorded in this range.</p>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm tabular-nums">
              <thead className="text-ink-soft dark:text-mist-soft">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Exercise</th>
                  <th className="px-2 py-1.5 text-right font-medium">Sets</th>
                  <th className="px-2 py-1.5 text-right font-medium">Reps</th>
                  <th className="px-2 py-1.5 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {report.exercises.map((e) => (
                  <tr key={e.title} className="border-t border-ink/10 dark:border-mist/10">
                    <td className="max-w-[16rem] truncate px-2 py-1.5">{e.title}</td>
                    <td className="px-2 py-1.5 text-right">{e.sets}</td>
                    <td className="px-2 py-1.5 text-right">{e.reps > 0 ? e.reps.toLocaleString() : "—"}</td>
                    <td className="px-2 py-1.5 text-right">{formatDuration(e.activeSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

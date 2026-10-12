"use client";

import { useRouter } from "next/navigation";
import { localDate } from "@/lib/schedule";
import { shiftDate, useToday } from "@/lib/use-now";

const PRESETS = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

export function RangePicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const today = useToday();
  const go = (f: string, t: string) => router.push(`/report?from=${f}&to=${t}`);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-full bg-ink/5 p-1 dark:bg-mist/10" role="group" aria-label="Date range">
        {PRESETS.map(({ label, days }) => {
          const start = today ? shiftDate(today, 1 - days) : null;
          const selected = today !== null && to === today && from === start;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                const end = localDate(Date.now());
                go(shiftDate(end, 1 - days), end);
              }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? "bg-white text-ink shadow-sm dark:bg-night-raised dark:text-mist"
                  : "text-ink-soft hover:text-ink dark:text-mist-soft dark:hover:text-mist"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <label className="sr-only" htmlFor="range-from">From</label>
        <input
          id="range-from"
          type="date"
          value={from}
          max={to}
          onChange={(e) => e.target.value && go(e.target.value, to)}
          className="rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-ink dark:border-mist/15 dark:bg-night-raised dark:text-mist"
        />
        <span className="text-ink-soft dark:text-mist-soft">–</span>
        <label className="sr-only" htmlFor="range-to">To</label>
        <input
          id="range-to"
          type="date"
          value={to}
          min={from}
          onChange={(e) => e.target.value && go(from, e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-ink dark:border-mist/15 dark:bg-night-raised dark:text-mist"
        />
      </div>
    </div>
  );
}

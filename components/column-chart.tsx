"use client";

import { useState } from "react";

export interface Column {
  key: string;
  /** Short axis label; empty string to leave the tick unlabeled. */
  label: string;
  /** Tooltip heading, e.g. the full date. */
  title: string;
  value: number;
  /** Formatted value for the tooltip, e.g. "1h 25m". */
  display: string;
}

interface ColumnChartProps {
  columns: Column[];
  /** Optional reference line, e.g. the daily goal. */
  reference?: { value: number; label: string };
  ariaLabel: string;
}

/** Rounds up to 2, then 1/2/5 × 10^n, so the axis ticks are clean whole numbers. */
function niceMax(value: number): number {
  if (value <= 2) return 2;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * magnitude >= value) ?? 10;
  return step * magnitude;
}

/**
 * Single-series column chart in plain HTML/CSS: one hue, thin columns with a
 * rounded data end, hairline grid, hover/focus tooltip per column.
 */
export function ColumnChart({ columns, reference, ariaLabel }: ColumnChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(reference?.value ?? 0, ...columns.map((c) => c.value)));
  const ticks = [0, max / 2, max].filter(Number.isInteger); // values are counts
  const active = hover !== null ? columns[hover] : null;

  return (
    <figure className="relative pt-3" aria-label={ariaLabel}>
      <div className="flex">
        {/* Y axis */}
        <div className="relative mr-2 w-10 shrink-0 text-right text-[11px] text-ink-soft tabular-nums dark:text-mist-soft">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / max) * 100}%` }}>
              {t.toLocaleString()}
            </span>
          ))}
        </div>

        <div className="relative h-48 flex-1 md:h-56" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px bg-ink/10 dark:bg-mist/10" style={{ bottom: `${(t / max) * 100}%` }} />
          ))}
          {reference && reference.value > 0 && (
            <div
              className="absolute inset-x-0 border-t border-ink-soft/60 dark:border-mist-soft/60"
              style={{ bottom: `${(reference.value / max) * 100}%` }}
            >
              <span className="absolute -top-5 right-0 rounded bg-paper/90 px-1 text-[11px] font-medium text-ink-soft dark:bg-night/90 dark:text-mist-soft">
                {reference.label}
              </span>
            </div>
          )}

          <div className="absolute inset-0 flex items-end">
            {columns.map((c, i) => (
              <button
                key={c.key}
                type="button"
                aria-label={`${c.title}: ${c.display}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className={`flex h-full min-w-0 flex-1 items-end justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-tomato ${
                  hover === i ? "bg-ink/[0.04] dark:bg-mist/[0.06]" : ""
                }`}
              >
                <span
                  className="block w-[min(24px,70%)] rounded-t-[4px] bg-tomato-deep dark:bg-tomato"
                  style={{ height: c.value > 0 ? `max(2px, ${(c.value / max) * 100}%)` : 0 }}
                />
              </button>
            ))}
          </div>

          {active && hover !== null && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-paper shadow-lg dark:bg-mist dark:text-night"
              style={{
                left: `clamp(3rem, ${((hover + 0.5) / columns.length) * 100}%, calc(100% - 3rem))`,
                bottom: `calc(${(active.value / max) * 100}% + 8px)`,
              }}
            >
              <div className="font-medium">{active.title}</div>
              <div className="opacity-80">{active.display}</div>
            </div>
          )}
        </div>
      </div>

      {/* X axis */}
      <div className="mt-1.5 ml-12 flex text-[11px] text-ink-soft dark:text-mist-soft">
        {columns.map((c) => (
          <span key={c.key} className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">
            {c.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

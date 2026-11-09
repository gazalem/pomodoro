"use client";

import { useEffect, type ReactNode } from "react";
import { formatClock } from "@/lib/format";
import { useNow } from "@/lib/use-now";

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The timing fields both the pomodoro and the workout phases share. */
export interface RingPhase {
  /** null = untimed (counts up until the user ends it). */
  plannedMs: number | null;
  accumulatedMs: number;
  resumedAt: number | null;
}

interface TimerRingProps {
  phase: RingPhase | null;
  /** Shown when idle: the length of the next phase. */
  idleMs: number;
  label: string;
  /** Browser tab title while idle. */
  idleTitle?: string;
  /** Stroke class for the unfilled track (contrasts with the page color). */
  trackClassName?: string;
  /** Replaces the big clock, e.g. "15 reps" for an untimed set; the clock then shows small, counting up. */
  center?: ReactNode;
}

/**
 * The cream arc is the time left; it retreats counter-clockwise toward
 * 12 o'clock as the phase runs, revealing the track underneath.
 */
export function TimerRing({ phase, idleMs, label, idleTitle = "Pomodoro", trackClassName = "stroke-salmon", center }: TimerRingProps) {
  const now = useNow();
  const elapsed = phase ? phase.accumulatedMs + (phase.resumedAt !== null && now !== null ? now - phase.resumedAt : 0) : 0;
  const untimed = phase !== null && phase.plannedMs === null;
  const total = phase ? (phase.plannedMs ?? 0) : idleMs;
  const left = phase ? Math.max(0, total - elapsed) : idleMs;
  const fraction = untimed ? 1 : total > 0 ? left / total : 0;
  const clock = formatClock(untimed ? elapsed : left);

  useEffect(() => {
    document.title = phase ? `${clock} · ${label}` : idleTitle;
  }, [clock, label, phase, idleTitle]);

  return (
    <div
      className="@container relative aspect-square w-[min(84vw,46dvh,440px)] md:w-[min(64vw,44dvh,440px)]"
      role="timer"
      aria-label={untimed ? `${label}: ${clock} elapsed` : `${label}: ${clock} remaining`}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="6" className={trackClassName} />
        {fraction > 0.001 && (
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            className="stroke-cream transition-[stroke-dasharray] duration-300 ease-linear"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-[10cqw] text-center">
        {/* Sized in container units so the digits always fit inside the ring. */}
        {center ?? (
          <span className={`leading-none font-extralight tracking-wide tabular-nums ${clock.length > 5 ? "text-[17cqw]" : "text-[23cqw]"}`}>
            {clock}
          </span>
        )}
        <span className="mt-[3cqw] text-[3.4cqw] font-medium tracking-[0.2em] text-cream/80 uppercase">{label}</span>
        {center && phase && <span className="mt-[1.5cqw] text-[5cqw] font-light text-cream/90 tabular-nums">{clock}</span>}
      </div>
    </div>
  );
}

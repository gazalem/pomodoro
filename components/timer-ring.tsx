"use client";

import { useEffect } from "react";
import { formatClock } from "@/lib/format";
import { remainingMs, type Phase } from "@/lib/schedule";
import { useNow } from "@/lib/use-now";
import type { PhaseType } from "@/lib/types";

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const PHASE_LABEL: Record<PhaseType, string> = {
  focus: "Focus",
  short_break: "Short break",
  long_break: "Long break",
  lunch: "Lunch",
};

interface TimerRingProps {
  phase: Phase | null;
  /** Shown when idle: the length of the next focus block. */
  idleMs: number;
}

/**
 * The cream arc is the time left; it retreats counter-clockwise toward
 * 12 o'clock as the phase runs, revealing the salmon track underneath.
 */
export function TimerRing({ phase, idleMs }: TimerRingProps) {
  const now = useNow();
  const left = phase ? (now === null ? phase.plannedMs - phase.accumulatedMs : remainingMs(phase, now)) : idleMs;
  const total = phase?.plannedMs ?? idleMs;
  const fraction = total > 0 ? left / total : 0;
  const clock = formatClock(left);
  const label = phase ? PHASE_LABEL[phase.type] : "Ready";

  useEffect(() => {
    document.title = phase ? `${clock} · ${label}` : "Pomodoro";
  }, [clock, label, phase]);

  return (
    <div
      className="@container relative aspect-square w-[min(84vw,46dvh,440px)] md:w-[min(64vw,44dvh,440px)]"
      role="timer"
      aria-label={`${label}: ${clock} remaining`}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="6" className="stroke-salmon" />
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
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Sized in container units so the digits always fit inside the ring. */}
        <span className={`leading-none font-extralight tracking-wide tabular-nums ${clock.length > 5 ? "text-[17cqw]" : "text-[23cqw]"}`}>
          {clock}
        </span>
        <span className="mt-[3cqw] text-[3.4cqw] font-medium tracking-[0.2em] text-cream/80 uppercase">{label}</span>
      </div>
    </div>
  );
}

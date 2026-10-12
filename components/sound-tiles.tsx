"use client";

import type { ComponentType, SVGProps } from "react";
import type { SoundKind } from "@/lib/ambient";
import { ClockIcon, FlameIcon, RainIcon, TreeIcon, WavesIcon } from "./icons";

const SOUNDS: { kind: SoundKind; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { kind: "ocean", label: "Ocean", Icon: WavesIcon },
  { kind: "fire", label: "Fire", Icon: FlameIcon },
  { kind: "rain", label: "Rain", Icon: RainIcon },
  { kind: "nature", label: "Nature", Icon: TreeIcon },
];

interface SoundTilesProps {
  selected: SoundKind | null;
  /** Whether the selected sound is audible right now (vs. waiting for focus). */
  playing: boolean;
  onSelect: (kind: SoundKind | null) => void;
}

export function SoundTiles({ selected, playing, onSelect }: SoundTilesProps) {
  return (
    <div className="grid w-full max-w-md grid-cols-4 gap-2.5 sm:gap-3" role="group" aria-label="Ambient sound">
      {SOUNDS.map(({ kind, label, Icon }) => {
        const active = selected === kind;
        const status = !active ? "Tap to play" : playing ? "Playing" : "Waiting";
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? null : kind)}
            className={`relative flex flex-col items-center gap-0.5 rounded-2xl border px-1 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream ${
              active
                ? "border-cream/80 bg-white/20 ring-1 ring-cream/40"
                : "border-white/15 bg-white/10 hover:bg-white/15"
            }`}
          >
            {active && !playing && <ClockIcon className="absolute top-2 right-2 text-xs text-white/80" />}
            <Icon className={`mb-1 text-lg text-white ${active && playing ? "motion-safe:animate-pulse" : ""}`} />
            <span className="text-sm font-semibold text-white">{label}</span>
            <span className="text-xs text-white/70">{status}</span>
          </button>
        );
      })}
    </div>
  );
}

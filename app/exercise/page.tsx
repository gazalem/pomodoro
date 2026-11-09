import type { Metadata, Viewport } from "next";
import { ExerciseGate } from "@/components/exercise-gate";

export const metadata: Metadata = { title: "Exercise" };

export const viewport: Viewport = { themeColor: "#17806b" };

export default function ExercisePage() {
  return (
    <div className="theme-exercise">
      <ExerciseGate />
    </div>
  );
}

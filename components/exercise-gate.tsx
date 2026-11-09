"use client";

import type { Repo } from "@/lib/repo";
import { DatabaseGate } from "./app-gate";
import { WorkoutApp } from "./workout-app";

async function loadExerciseData(repo: Repo) {
  const [settings, exercises] = await Promise.all([repo.getSettings(), repo.listExercises()]);
  return { settings, exercises };
}

/** The exercise page: opens the database, then shows the workout timer. */
export function ExerciseGate() {
  return (
    <DatabaseGate load={loadExerciseData} shellRingClassName="border-mint">
      {(db, data) => <WorkoutApp db={db} initialSettings={data.settings} initialExercises={data.exercises} />}
    </DatabaseGate>
  );
}

"use client";

import { useCallback, useState } from "react";
import type { Repo } from "./repo";
import type { Exercise } from "./types";

export type ExerciseInput = Pick<Exercise, "title" | "sets" | "mode" | "reps" | "durationSeconds">;

/** Exercise list state with optimistic updates; reloads from the database on failure. */
export function useExercises(repo: Repo, initial: Exercise[]) {
  const [exercises, setExercises] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setExercises(await repo.listExercises());
      setError(null);
    } catch {
      setError("Couldn't load exercises.");
    }
  }, [repo]);

  const mutate = useCallback(
    async (optimistic: (list: Exercise[]) => Exercise[], run: () => Promise<void>) => {
      setExercises(optimistic);
      try {
        await run();
        setError(null);
      } catch {
        setError("Couldn't save that change.");
        await refresh();
      }
    },
    [refresh],
  );

  const add = useCallback(
    async (input: ExerciseInput) => {
      try {
        const created = await repo.createExercise(input);
        if (!created) throw new Error("invalid exercise");
        setExercises((list) => [...list.filter((e) => !e.done), created, ...list.filter((e) => e.done)]);
        setError(null);
        return created;
      } catch {
        setError("Couldn't add the exercise.");
        return null;
      }
    },
    [repo],
  );

  const update = useCallback(
    (id: number, patch: Partial<ExerciseInput & { done: boolean }>) =>
      mutate(
        (list) => {
          const next = list.map((e) => (e.id === id ? { ...e, ...patch } : e));
          // Keep open exercises above completed ones.
          return [...next.filter((e) => !e.done), ...next.filter((e) => e.done)];
        },
        async () => {
          const saved = await repo.updateExercise(id, patch);
          if (!saved) throw new Error("exercise not found");
          setExercises((list) => list.map((e) => (e.id === id ? saved : e)));
        },
      ),
    [mutate, repo],
  );

  const reorder = useCallback(
    (openIds: number[]) =>
      mutate(
        (list) => {
          const byId = new Map(list.map((e) => [e.id, e]));
          const open = openIds.map((id) => byId.get(id)).filter((e): e is Exercise => !!e && !e.done);
          return [...open, ...list.filter((e) => e.done || !openIds.includes(e.id))];
        },
        () => repo.reorderExercises(openIds),
      ),
    [mutate, repo],
  );

  const remove = useCallback(
    (id: number) =>
      mutate(
        (list) => list.filter((e) => e.id !== id),
        async () => {
          await repo.deleteExercise(id);
        },
      ),
    [mutate, repo],
  );

  /** Unchecks every exercise so the whole list can be done again. */
  const reset = useCallback(
    () =>
      mutate(
        (list) => list.map((e) => ({ ...e, done: false, completedAt: null })),
        async () => {
          await repo.resetExercises();
          setExercises(await repo.listExercises());
        },
      ),
    [mutate, repo],
  );

  return { exercises, error, refresh, add, update, reorder, remove, reset };
}

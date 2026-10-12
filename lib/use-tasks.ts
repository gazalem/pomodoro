"use client";

import { useCallback, useState } from "react";
import type { Repo } from "./repo";
import { localDate } from "./schedule";
import type { Task } from "./types";

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Task list state with optimistic updates. On failure the list is reloaded
 * from the database so the UI never drifts from what is stored.
 */
export function useTasks(repo: Repo, initial: Task[]) {
  const [tasks, setTasks] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTasks(await repo.listTasks(startOfToday()));
      setError(null);
    } catch {
      setError("Couldn't load tasks.");
    }
  }, [repo]);

  const mutate = useCallback(
    async (optimistic: (list: Task[]) => Task[], run: () => Promise<void>) => {
      setTasks(optimistic);
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
    async (title: string, estimatedPomodoros: number) => {
      try {
        const task = await repo.createTask({ title, estimatedPomodoros });
        if (!task) throw new Error("invalid task");
        setTasks((list) => [...list.filter((t) => !t.done), task, ...list.filter((t) => t.done)]);
        setError(null);
        return task;
      } catch {
        setError("Couldn't add the task.");
        return null;
      }
    },
    [repo],
  );

  const update = useCallback(
    (id: number, patch: Partial<Pick<Task, "title" | "estimatedPomodoros" | "done">>) =>
      mutate(
        (list) =>
          list.map((t) =>
            t.id === id
              ? { ...t, ...patch, completedAt: patch.done === undefined ? t.completedAt : patch.done ? Date.now() : null }
              : t,
          ),
        async () => {
          const saved = await repo.updateTask(id, patch, localDate(Date.now()));
          if (!saved) throw new Error("task not found");
          setTasks((list) => list.map((t) => (t.id === id ? saved : t)));
        },
      ),
    [mutate, repo],
  );

  const remove = useCallback(
    (id: number) =>
      mutate(
        (list) => list.filter((t) => t.id !== id),
        async () => {
          await repo.deleteTask(id);
        },
      ),
    [mutate, repo],
  );

  return { tasks, error, refresh, add, update, remove };
}

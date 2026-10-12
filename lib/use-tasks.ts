"use client";

import { useCallback, useState } from "react";
import { localDate } from "./schedule";
import type { Task } from "./types";

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} failed: ${res.status}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

/**
 * Task list state with optimistic updates. On failure the list is reloaded
 * from the server so the UI never drifts from what is stored.
 */
export function useTasks(initial: Task[]) {
  const [tasks, setTasks] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTasks(await request<Task[]>(`/api/tasks?since=${startOfToday()}`));
      setError(null);
    } catch {
      setError("Couldn't load tasks. Check your connection.");
    }
  }, []);

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

  const add = useCallback(async (title: string, estimatedPomodoros: number) => {
    try {
      const task = await request<Task>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ title, estimatedPomodoros }),
      });
      setTasks((list) => [...list.filter((t) => !t.done), task, ...list.filter((t) => t.done)]);
      setError(null);
      return task;
    } catch {
      setError("Couldn't add the task.");
      return null;
    }
  }, []);

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
          const saved = await request<Task>(`/api/tasks/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ ...patch, localDate: localDate(Date.now()) }),
          });
          setTasks((list) => list.map((t) => (t.id === id ? saved : t)));
        },
      ),
    [mutate],
  );

  const remove = useCallback(
    (id: number) =>
      mutate(
        (list) => list.filter((t) => t.id !== id),
        () => request<void>(`/api/tasks/${id}`, { method: "DELETE" }),
      ),
    [mutate],
  );

  return { tasks, error, refresh, add, update, remove };
}

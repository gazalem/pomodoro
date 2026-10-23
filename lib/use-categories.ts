"use client";

import { useCallback, useState } from "react";
import type { CategoryColor } from "./categories";
import type { Repo } from "./repo";
import type { Category } from "./types";

/** Category list state. Each action resolves to an error message, or null on success. */
export function useCategories(repo: Repo, initial: Category[]) {
  const [categories, setCategories] = useState(initial);

  const run = useCallback(async (action: () => Promise<void>): Promise<string | null> => {
    try {
      await action();
      return null;
    } catch (error) {
      setCategories(await repo.listCategories().catch(() => initial));
      return error instanceof Error ? error.message : "Couldn't save that change.";
    }
  }, [repo, initial]);

  const add = useCallback(
    (name: string) =>
      run(async () => {
        const created = await repo.createCategory({ name });
        setCategories((list) => [...list, created]);
      }),
    [repo, run],
  );

  const update = useCallback(
    (id: number, patch: { name?: string; color?: CategoryColor }) =>
      run(async () => {
        setCategories((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
        const saved = await repo.updateCategory(id, patch);
        if (!saved) throw new Error("Couldn't save that change.");
        setCategories((list) => list.map((c) => (c.id === id ? saved : c)));
      }),
    [repo, run],
  );

  const remove = useCallback(
    (id: number) =>
      run(async () => {
        setCategories((list) => list.filter((c) => c.id !== id));
        await repo.deleteCategory(id);
      }),
    [repo, run],
  );

  return { categories, add, update, remove };
}

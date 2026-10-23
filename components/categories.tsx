"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { CATEGORY_COLORS, CATEGORY_HEX, MAX_CATEGORIES, type CategoryColor } from "@/lib/categories";
import type { Category } from "@/lib/types";
import { CheckIcon, PlusIcon, TrashIcon } from "./icons";

/** "all" tasks, "none" = uncategorized, or a category id. */
export type CategoryFilterValue = "all" | "none" | number;

const colorName = (color: CategoryColor) => color[0].toUpperCase() + color.slice(1);

/** Identity dot. Always shown next to the category's name, never on its own. */
export function CategoryDot({ color, className = "" }: { color: CategoryColor | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-2.5 shrink-0 rounded-full ${color ? "" : "border-[1.5px] border-ink-soft/50"} ${className}`}
      style={color ? { backgroundColor: CATEGORY_HEX[color].light } : undefined}
    />
  );
}

// ---------------------------------------------------------------------------

interface CategoryFilterProps {
  categories: Category[];
  value: CategoryFilterValue;
  /** Open-task counts per category id; `none` = uncategorized. */
  counts: { total: number; none: number; byId: Map<number, number> };
  onChange: (value: CategoryFilterValue) => void;
  managing: boolean;
  onToggleManage: () => void;
}

export function CategoryFilter({ categories, value, counts, onChange, managing, onToggleManage }: CategoryFilterProps) {
  const chip = (selected: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-tomato ${
      selected ? "border-ink bg-ink text-paper" : "border-ink/15 bg-white text-ink hover:bg-ink/5"
    }`;
  const count = (n: number) => <span className="tabular-nums opacity-60">{n}</span>;

  return (
    <div className="flex items-start gap-2">
      <div
        role="group"
        aria-label="Filter tasks by category"
        className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
      >
        <button type="button" aria-pressed={value === "all"} onClick={() => onChange("all")} className={chip(value === "all")}>
          All {count(counts.total)}
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={value === c.id}
            onClick={() => onChange(c.id)}
            className={chip(value === c.id)}
          >
            <CategoryDot color={c.color} />
            {c.name} {count(counts.byId.get(c.id) ?? 0)}
          </button>
        ))}
        {(counts.none > 0 || value === "none") && (
          <button type="button" aria-pressed={value === "none"} onClick={() => onChange("none")} className={chip(value === "none")}>
            <CategoryDot color={null} />
            Uncategorized {count(counts.none)}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onToggleManage}
        aria-expanded={managing}
        className="shrink-0 rounded-full px-2.5 py-1.5 text-sm font-medium text-ink-soft hover:bg-ink/5 hover:text-ink"
      >
        {managing ? "Done" : "Edit"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Native select (accessible, phone-friendly) with the chosen category's dot beside it. */
export function CategorySelect({
  categories,
  value,
  onChange,
  label = "Category",
}: {
  categories: Category[];
  value: number | null;
  onChange: (value: number | null) => void;
  label?: string;
}) {
  const id = useId();
  const selected = categories.find((c) => c.id === value) ?? null;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-sm text-ink-soft">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <CategoryDot color={selected?.color ?? null} />
      <select
        id={id}
        value={selected ? String(selected.id) : ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="min-w-0 max-w-[10rem] truncate rounded-lg border border-ink/15 bg-white py-1.5 pr-1 pl-2 text-sm text-ink focus:border-tomato focus:outline-none"
      >
        <option value="">No category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Result = Promise<string | null>;

interface CategoryManagerProps {
  categories: Category[];
  onAdd: (name: string) => Result;
  onUpdate: (id: number, patch: { name?: string; color?: CategoryColor }) => Result;
  onDelete: (id: number) => Result;
}

/** Add, rename, recolor and delete categories. Changes save immediately. */
export function CategoryManager({ categories, onAdd, onUpdate, onDelete }: CategoryManagerProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [colorFor, setColorFor] = useState<number | null>(null);
  const id = useId();
  const full = categories.length >= MAX_CATEGORIES;

  const report = (message: string | null) => setError(message);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || full) return;
    const message = await onAdd(name);
    report(message);
    if (!message) setName("");
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-ink/10 bg-white p-3">
      <h4 id={`${id}-title`} className="mb-2 text-sm font-semibold text-ink">
        Categories
      </h4>
      <ul className="flex flex-col gap-1">
        {categories.map((c) => (
          <li key={c.id}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setColorFor(colorFor === c.id ? null : c.id)}
                aria-expanded={colorFor === c.id}
                aria-label={`Color for "${c.name}": ${colorName(c.color)}. Change`}
                className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-tomato"
              >
                <CategoryDot color={c.color} className="size-4" />
              </button>
              <NameInput
                key={`${c.id}-${c.name}`}
                category={c}
                onCommit={async (next) => report(await onUpdate(c.id, { name: next }))}
              />
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm(`Delete "${c.name}"? Its tasks are kept, without a category.`)) {
                    report(await onDelete(c.id));
                  }
                }}
                aria-label={`Delete category "${c.name}"`}
                className="grid size-8 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-tomato-deep"
              >
                <TrashIcon />
              </button>
            </div>
            {colorFor === c.id && (
              <div role="radiogroup" aria-label={`Color for "${c.name}"`} className="ml-10 flex flex-wrap gap-1.5 py-2">
                {CATEGORY_COLORS.map((color) => {
                  const taken = categories.find((o) => o.color === color && o.id !== c.id);
                  return (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-checked={c.color === color}
                      disabled={!!taken}
                      aria-label={`${colorName(color)}${taken ? ` (used by ${taken.name})` : ""}`}
                      title={taken ? `${colorName(color)}, used by ${taken.name}` : colorName(color)}
                      onClick={async () => {
                        setColorFor(null);
                        if (color !== c.color) report(await onUpdate(c.id, { color }));
                      }}
                      className="grid size-7 place-items-center rounded-full text-white ring-offset-2 focus-visible:outline-2 focus-visible:outline-tomato disabled:cursor-not-allowed aria-checked:ring-2 aria-checked:ring-ink"
                      style={{ backgroundColor: CATEGORY_HEX[color].light, opacity: taken ? 0.45 : 1 }}
                    >
                      {c.color === color && <CheckIcon className="text-xs" />}
                    </button>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="mt-2 flex gap-2">
        <label htmlFor={`${id}-new`} className="sr-only">
          New category name
        </label>
        <input
          id={`${id}-new`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={full ? `Limit of ${MAX_CATEGORIES} reached` : "New category, e.g. Reading"}
          disabled={full}
          maxLength={40}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:border-tomato focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={full || !name.trim()}
          className="flex items-center gap-1 rounded-full bg-tomato px-3.5 text-sm font-semibold text-white hover:bg-tomato-deep disabled:opacity-40"
        >
          <PlusIcon className="text-xs" /> Add
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-tomato-deep">
          {error}
        </p>
      )}
    </section>
  );
}

/** Inline rename: Enter or leaving the field saves, Escape reverts. */
function NameInput({ category, onCommit }: { category: Category; onCommit: (name: string) => void }) {
  const [value, setValue] = useState(category.name);

  function commit() {
    const next = value.trim();
    if (!next) setValue(category.name);
    else if (next !== category.name) onCommit(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      // Revert this field only; don't close the tasks sheet.
      e.preventDefault();
      e.stopPropagation();
      setValue(category.name);
    }
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      maxLength={40}
      aria-label={`Name of category "${category.name}"`}
      className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1.5 text-sm text-ink hover:border-ink/15 focus:border-tomato focus:outline-none"
    />
  );
}

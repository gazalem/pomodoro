/**
 * Category colors: a validated 8-slot categorical palette (CVD-safe in light
 * and dark), assigned in fixed order. A category keeps its color for life;
 * colors are never derived from rank or position.
 */
export const CATEGORY_COLORS = ["blue", "orange", "aqua", "yellow", "magenta", "green", "violet", "red"] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

/** Light values are for the paper/white UI; dark values for the report's dark mode. */
export const CATEGORY_HEX: Record<CategoryColor, { light: string; dark: string }> = {
  blue: { light: "#2a78d6", dark: "#3987e5" },
  orange: { light: "#eb6834", dark: "#d95926" },
  aqua: { light: "#1baf7a", dark: "#199e70" },
  yellow: { light: "#eda100", dark: "#c98500" },
  magenta: { light: "#e87ba4", dark: "#d55181" },
  green: { light: "#008300", dark: "#008300" },
  violet: { light: "#6250d6", dark: "#9085e9" },
  red: { light: "#e34948", dark: "#e66767" },
};

/** One color per category, so identity never repeats. */
export const MAX_CATEGORIES = CATEGORY_COLORS.length;

export function isCategoryColor(value: unknown): value is CategoryColor {
  return typeof value === "string" && (CATEGORY_COLORS as readonly string[]).includes(value);
}

/** First palette slot not already taken, in fixed order. */
export function nextFreeColor(used: readonly string[]): CategoryColor {
  return CATEGORY_COLORS.find((c) => !used.includes(c)) ?? CATEGORY_COLORS[0];
}

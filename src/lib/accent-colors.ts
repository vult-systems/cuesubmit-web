/**
 * Centralized Accent Colors
 * =========================
 * Consistent accent colors for section cards across the app.
 * Uses subtle borders in both light and dark modes.
 */

export const accentColors = {
  blue: {
    border: "border-l-blue-500/40 dark:border-l-blue-400/50",
    pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  amber: {
    border: "border-l-amber-500/40 dark:border-l-amber-400/50",
    pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  emerald: {
    border: "border-l-emerald-500/40 dark:border-l-emerald-400/50",
    pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  purple: {
    border: "border-l-purple-500/40 dark:border-l-purple-400/50",
    pill: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  },
  rose: {
    border: "border-l-rose-500/40 dark:border-l-rose-400/50",
    pill: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  },
  cyan: {
    border: "border-l-cyan-500/40 dark:border-l-cyan-400/50",
    pill: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  },
} as const;

// Semantic aliases for submit page
export const sectionAccents = {
  cool: accentColors.blue,
  warm: accentColors.amber,
} as const;

// Array for cycling through colors (hosts page)
export const accentColorList = [
  accentColors.blue,
  accentColors.amber,
  accentColors.emerald,
  accentColors.purple,
  accentColors.rose,
  accentColors.cyan,
] as const;

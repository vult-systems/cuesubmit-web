/**
 * Centralized UI Token Classes
 * 
 * Provides theme-aware Tailwind class combinations that work in both
 * light and dark modes. Use these instead of hardcoding colors.
 * 
 * NOTE: The tooltip component (/src/components/ui/tooltip.tsx) has unified 
 * default styling. Only use these tokens if you need to override.
 */

/**
 * Tooltip styling - unified dark bg for contrast (matches tooltip.tsx defaults)
 * Only use if you need custom styling - the TooltipContent component already has these defaults
 */
export const tooltip = {
  content: "bg-neutral-900 dark:bg-black border-neutral-700 dark:border-white/10 text-white text-xs font-medium shadow-xl shadow-black/20 dark:shadow-black/50",
} as const;

/**
 * Card/panel backgrounds
 */
export const surface = {
  base: "bg-surface",
  muted: "bg-surface-muted",
  raised: "bg-surface-raised",
  glass: "bg-white/50 dark:bg-white/[0.03] backdrop-blur-xl",
} as const;

/**
 * Border styles
 */
export const border = {
  default: "border-border",
  muted: "border-border-muted",
  subtle: "border-neutral-200 dark:border-white/[0.08]",
} as const;

/**
 * Text colors
 */
export const text = {
  primary: "text-text-primary",
  secondary: "text-text-secondary",
  muted: "text-text-muted",
  // For use on dark backgrounds (like tooltips)
  onDark: "text-white",
} as const;

/**
 * Status badge styles (theme-aware)
 */
export const statusBadge = {
  // Job statuses
  PENDING: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30",
  RUNNING: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30",
  FINISHED: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30",
  DEAD: "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30",
  PAUSED: "bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-white/[0.03] dark:text-text-muted dark:border-white/[0.08]",
  
  // Frame statuses  
  WAITING: "bg-neutral-100 text-neutral-500 border-neutral-200 dark:bg-white/[0.05] dark:text-white/50 dark:border-white/[0.08]",
  SUCCEEDED: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30",
  DEPEND: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30",
  EATEN: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/30",
  CHECKPOINT: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-400 dark:border-cyan-500/30",
} as const;

/**
 * Interactive element styles
 */
export const interactive = {
  ghost: "text-text-secondary hover:text-text-primary hover:bg-neutral-100 dark:hover:bg-white/5",
  ghostMuted: "text-text-muted hover:text-text-secondary hover:bg-neutral-100/50 dark:hover:bg-white/5",
  disabled: "text-neutral-400 dark:text-white/20 cursor-not-allowed",
} as const;

/**
 * Form input styles
 */
export const input = {
  base: "bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 text-text-primary placeholder:text-text-muted focus:border-neutral-400 dark:focus:border-white/20 focus:ring-0",
} as const;

/**
 * Dialog/modal styles
 */
export const dialog = {
  content: "bg-white dark:bg-linear-to-br dark:from-zinc-900 dark:to-black border-neutral-200 dark:border-white/10",
  header: "border-b border-neutral-200 dark:border-white/8",
  title: "text-text-primary",
} as const;

/**
 * Button variants that complement shadcn
 */
export const button = {
  subtle: "border-neutral-200 dark:border-white/10 text-text-secondary hover:text-text-primary hover:bg-neutral-50 dark:hover:bg-white/5",
} as const;

/**
 * Log line colors for frame logs
 */
export const logLine = {
  DEBUG: "text-neutral-400 dark:text-white/40",
  INFO: "text-neutral-600 dark:text-white/70",
  WARNING: "text-amber-600 dark:text-amber-400",
  ERROR: "text-red-600 dark:text-red-400",
  separator: "text-neutral-300 dark:text-white/30",
  default: "text-neutral-500 dark:text-white/60",
} as const;

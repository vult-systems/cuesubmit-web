/**
 * Centralized Icon Button Styles
 * ===============================
 * Use these consistent styles for all icon buttons across the app.
 * Import and spread into className for consistency.
 * 
 * Theme-aware: Uses dark: prefix for dark mode specific colors.
 */

export const iconButtonStyles = {
  // Base styles applied to all icon buttons
  base: "rounded-lg transition-all",
  
  // Size variants
  size: {
    sm: "h-7 w-7",
    md: "h-8 w-8",
    lg: "h-9 w-9",
  },
  
  // Semantic color variants - theme aware
  variant: {
    // Informational actions (logs, view, info)
    info: "text-blue-600 dark:text-blue-400/70 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-blue-500/10",
    
    // Neutral actions (settings, edit, rename)
    neutral: "text-neutral-500 dark:text-white/40 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-500/10 dark:hover:bg-white/10",
    
    // Success/Active state (activate, unlock, confirm)
    success: "text-emerald-600 dark:text-emerald-400/70 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-500/10",
    
    // Warning/Pause state (pause, lock, caution)
    warning: "text-amber-600 dark:text-amber-400/70 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-500/10",
    
    // Danger/Destructive (delete, kill, remove)
    danger: "text-red-600 dark:text-red-400/70 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-500/10",
    
    // Action/Retry (retry, refresh, redo)
    action: "text-orange-600 dark:text-orange-400/70 hover:text-orange-700 dark:hover:text-orange-400 hover:bg-orange-500/10",
    
    // Special/Purple (eat, archive, special actions)
    special: "text-purple-600 dark:text-purple-400/70 hover:text-purple-700 dark:hover:text-purple-400 hover:bg-purple-500/10",
    
    // Disabled state
    disabled: "text-neutral-300 dark:text-white/20 cursor-not-allowed",
  },
} as const;

/**
 * Helper function to build icon button className
 * @param variant - The semantic variant (info, neutral, success, etc.)
 * @param size - Size variant (sm, md, lg) - defaults to md
 * @param disabled - Whether the button is disabled
 * @returns Combined className string
 */
export function getIconButtonClass(
  variant: keyof typeof iconButtonStyles.variant,
  size: keyof typeof iconButtonStyles.size = "md",
  disabled?: boolean
): string {
  const classes = [
    iconButtonStyles.base,
    iconButtonStyles.size[size],
    disabled ? iconButtonStyles.variant.disabled : iconButtonStyles.variant[variant],
  ];
  return classes.join(" ");
}

/**
 * Pre-built common icon button classes for quick access
 */
export const iconButton = {
  // Logs button (blue)
  logs: `${iconButtonStyles.base} ${iconButtonStyles.size.md} ${iconButtonStyles.variant.info}`,
  logsSmall: `${iconButtonStyles.base} ${iconButtonStyles.size.sm} ${iconButtonStyles.variant.info}`,
  
  // Settings/Edit button (neutral)
  settings: `${iconButtonStyles.base} ${iconButtonStyles.size.md} ${iconButtonStyles.variant.neutral}`,
  edit: `${iconButtonStyles.base} ${iconButtonStyles.size.md} ${iconButtonStyles.variant.neutral}`,
  
  // Activate/Success button (green)
  activate: `${iconButtonStyles.base} ${iconButtonStyles.size.md} ${iconButtonStyles.variant.success}`,
  
  // Pause/Lock button (amber)
  pause: `${iconButtonStyles.base} ${iconButtonStyles.size.md} ${iconButtonStyles.variant.warning}`,
  lock: `${iconButtonStyles.base} ${iconButtonStyles.size.md} ${iconButtonStyles.variant.warning}`,
  
  // Delete/Kill button (red)
  delete: `${iconButtonStyles.base} ${iconButtonStyles.size.md} ${iconButtonStyles.variant.danger}`,
  kill: `${iconButtonStyles.base} ${iconButtonStyles.size.md} ${iconButtonStyles.variant.danger}`,
  
  // Retry button (orange)
  retry: `${iconButtonStyles.base} ${iconButtonStyles.size.md} ${iconButtonStyles.variant.action}`,
  
  // Eat/Archive button (purple)
  eat: `${iconButtonStyles.base} ${iconButtonStyles.size.md} ${iconButtonStyles.variant.special}`,
} as const;

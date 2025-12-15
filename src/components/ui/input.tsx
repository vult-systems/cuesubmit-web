import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Base styling
        "h-8 w-full min-w-0 rounded-lg border px-2.5 py-1.5 text-xs transition-all duration-200 outline-none",
        // Surface + border (theme-aware)
        "bg-transparent border-neutral-200 dark:border-white/10 text-text-primary",
        // Placeholder
        "placeholder:text-text-muted",
        // Selection
        "selection:bg-blue-500/20 selection:text-text-primary",
        // Hover: subtle border change
        "hover:border-neutral-300 dark:hover:border-white/15 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]",
        // Focus: clean glow
        "focus-visible:border-neutral-400 dark:focus-visible:border-white/20 focus-visible:bg-black/[0.02] dark:focus-visible:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-neutral-200 dark:focus-visible:ring-white/8",
        // Error state
        "aria-invalid:border-red-500/50 aria-invalid:ring-red-500/20",
        // File input styling
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-text-primary",
        // Disabled
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      {...props}
    />
  )
}

export { Input }

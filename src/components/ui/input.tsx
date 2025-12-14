import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Base styling
        "h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs transition-all outline-none md:text-sm",
        // Surface + border (semantic tokens)
        "bg-surface-muted border-border text-text-primary",
        // Placeholder
        "placeholder:text-text-muted",
        // Selection
        "selection:bg-accent selection:text-white",
        // Hover: increase border contrast
        "hover:border-text-muted/50",
        // Focus: accent ring
        "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30",
        // Error state
        "aria-invalid:border-danger aria-invalid:ring-danger/20",
        // File input styling
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-text-primary",
        // Disabled
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }

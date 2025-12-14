"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Base styling
        "peer size-4 shrink-0 rounded-[4px] border shadow-xs transition-all outline-none",
        // Surface + border (semantic tokens)
        "bg-surface-muted border-border",
        // Checked state: accent background
        "data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=checked]:text-white",
        // Focus: accent ring
        "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30",
        // Error state
        "aria-invalid:border-danger aria-invalid:ring-danger/20",
        // Disabled
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }

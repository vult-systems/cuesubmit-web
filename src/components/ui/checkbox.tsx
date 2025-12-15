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
        "peer size-4 shrink-0 rounded-md border transition-all duration-200 outline-none",
        // Surface + border (theme-aware)
        "bg-white dark:bg-white/2 border-neutral-300 dark:border-white/15",
        // Checked state (theme-aware)
        "data-[state=checked]:bg-neutral-900 dark:data-[state=checked]:bg-white data-[state=checked]:border-neutral-900 dark:data-[state=checked]:border-white data-[state=checked]:text-white dark:data-[state=checked]:text-black",
        // Focus (theme-aware)
        "focus-visible:border-neutral-500 dark:focus-visible:border-white/30 focus-visible:ring-2 focus-visible:ring-neutral-200 dark:focus-visible:ring-white/20",
        // Hover (theme-aware)
        "hover:border-neutral-400 dark:hover:border-white/25",
        // Error state
        "aria-invalid:border-red-500/50 aria-invalid:ring-red-500/20",
        // Disabled
        "disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
      >
        <CheckIcon className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }

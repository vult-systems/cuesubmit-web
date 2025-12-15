import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Base styles - smooth transitions
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 outline-none disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary: inverted button (theme-aware)
        default: "bg-neutral-900 dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-white/90 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-neutral-500 dark:focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black",
        // Destructive: danger color
        destructive: "bg-red-500 text-white hover:bg-red-400 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-red-500/30",
        // Outline: subtle bordered (theme-aware)
        outline: "border border-neutral-200 dark:border-white/[0.12] bg-transparent text-text-primary hover:bg-neutral-100 dark:hover:bg-white/[0.05] hover:border-neutral-300 dark:hover:border-white/[0.2] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-neutral-200 dark:focus-visible:ring-white/20",
        // Secondary: muted surface (theme-aware)
        secondary: "bg-neutral-100 dark:bg-white/[0.08] text-text-primary dark:text-white hover:bg-neutral-200 dark:hover:bg-white/[0.12] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-neutral-200 dark:focus-visible:ring-white/20",
        // Ghost: transparent with hover (theme-aware)
        ghost: "text-text-secondary hover:bg-neutral-100 dark:hover:bg-white/[0.05] hover:text-text-primary dark:hover:text-white focus-visible:ring-2 focus-visible:ring-neutral-200 dark:focus-visible:ring-white/20",
        // Link: text with underline (theme-aware)
        link: "text-text-primary underline-offset-4 hover:underline hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-neutral-200 dark:focus-visible:ring-white/20",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-lg gap-1.5 px-4",
        lg: "h-11 rounded-xl px-6",
        icon: "size-10 rounded-xl",
        "icon-sm": "size-9 rounded-lg",
        "icon-lg": "size-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

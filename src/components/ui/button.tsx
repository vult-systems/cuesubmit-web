import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Base styles
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary: accent background
        default: "bg-accent text-white hover:bg-accent-muted focus-visible:ring-2 focus-visible:ring-accent/30",
        // Destructive: danger color
        destructive: "bg-danger text-white hover:bg-danger/90 focus-visible:ring-2 focus-visible:ring-danger/30",
        // Outline: bordered with hover highlight
        outline: "border border-border bg-surface-muted text-text-primary hover:bg-surface-muted hover:border-text-muted/50 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30",
        // Secondary: muted surface
        secondary: "bg-surface-muted text-text-primary hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent/30",
        // Ghost: transparent with hover
        ghost: "text-text-secondary hover:bg-surface-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/30",
        // Link: text with underline
        link: "text-accent underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-accent/30",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
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

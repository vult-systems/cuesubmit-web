import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-1.5 py-px text-[10px] font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-2.5 gap-1 [&>svg]:pointer-events-none transition-all duration-200 overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-neutral-200 dark:border-white/[0.08] bg-neutral-100 dark:bg-white/[0.05] text-text-secondary [a&]:hover:bg-neutral-200 dark:[a&]:hover:bg-white/[0.08]",
        secondary:
          "border-transparent bg-neutral-50 dark:bg-white/[0.03] text-text-muted [a&]:hover:bg-neutral-100 dark:[a&]:hover:bg-white/[0.06]",
        destructive:
          "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400 [a&]:hover:bg-red-500/15",
        outline:
          "border-neutral-200 dark:border-white/[0.1] text-text-muted [a&]:hover:bg-neutral-100 dark:[a&]:hover:bg-white/[0.03] [a&]:hover:text-text-secondary",
        success:
          "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 [a&]:hover:bg-emerald-500/15",
        warning:
          "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 [a&]:hover:bg-amber-500/15",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

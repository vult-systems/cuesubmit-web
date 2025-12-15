"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: "bg-black/95 backdrop-blur-xl border-white/[0.1] text-white shadow-2xl shadow-black/50 rounded-xl",
          title: "text-white font-medium",
          description: "text-white/60",
          success: "border-emerald-500/20 [&>svg]:text-emerald-400",
          error: "border-red-500/20 [&>svg]:text-red-400",
          warning: "border-amber-500/20 [&>svg]:text-amber-400",
          info: "border-blue-500/20 [&>svg]:text-blue-400",
        },
      }}
      style={
        {
          "--normal-bg": "rgba(0, 0, 0, 0.95)",
          "--normal-text": "rgba(255, 255, 255, 0.9)",
          "--normal-border": "rgba(255, 255, 255, 0.1)",
          "--border-radius": "0.75rem",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }

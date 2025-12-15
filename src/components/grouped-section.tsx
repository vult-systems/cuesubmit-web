"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupedSectionProps {
  title: string;
  badge: string;
  stats?: string;
  accentColors: {
    border: string;
    pill: string;
  };
  children: React.ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
  rightContent?: React.ReactNode;
  contentClassName?: string;
}

export function GroupedSection({
  title,
  badge,
  stats,
  accentColors,
  children,
  defaultOpen = true,
  collapsible = true,
  rightContent,
  contentClassName,
}: GroupedSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 backdrop-blur-xl overflow-hidden border-l-[3px]",
        accentColors.border
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2 transition-colors",
          collapsible && "cursor-pointer hover:bg-neutral-50 dark:hover:bg-white/3",
          isOpen && "border-b border-neutral-200 dark:border-white/6"
        )}
        onClick={collapsible ? () => setIsOpen(!isOpen) : undefined}
      >
        <div className="flex items-center gap-2">
          {collapsible && (
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-text-muted transition-transform duration-200",
                !isOpen && "-rotate-90"
              )}
            />
          )}
          <h2 className="text-xs font-medium text-text-primary">{title}</h2>
          <span
            className={cn(
              "text-[9px] font-medium px-1.5 py-px rounded-full border",
              accentColors.pill
            )}
          >
            {badge}
          </span>
        </div>
        {stats && <span className="text-[10px] text-text-muted">{stats}</span>}
        {rightContent}
      </div>
      {/* Content */}
      {isOpen && (
        <div className={contentClassName}>
          {children}
        </div>
      )}
    </div>
  );
}

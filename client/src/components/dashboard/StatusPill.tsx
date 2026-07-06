import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// The single source of the status palette and its label pairing. A status color
// never travels alone: a pill always carries text, and a bare dot always carries
// a title/aria-label for the dense rows where the text sits beside it.
export type StatusTone = "success" | "warning" | "destructive" | "muted";

const PILL_TONE: Record<StatusTone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning-subtle text-warning",
  destructive: "bg-destructive-subtle text-destructive",
  muted: "bg-muted text-muted-foreground",
};

const DOT_TONE: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  muted: "bg-muted-foreground/60",
};

export function StatusPill({
  tone,
  children,
  icon,
  className,
}: {
  tone: StatusTone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        PILL_TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function StatusDot({
  tone,
  label,
  pulse = false,
  className,
}: {
  tone: StatusTone;
  label: string;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("inline-block size-2 shrink-0 rounded-full", DOT_TONE[tone], pulse && "animate-pulse", className)}
    />
  );
}

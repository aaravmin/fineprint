import { cn } from "../../lib/utils.ts";

const tones: Record<string, string> = {
  open: "bg-muted/15 text-muted",
  claimed: "bg-accent/15 text-accent",
  in_review: "bg-sky-400/15 text-sky-400",
  approved: "bg-ok/15 text-ok",
  rejected: "bg-warn/15 text-warn",
  done: "bg-ok/15 text-ok",
  idle: "bg-muted/15 text-muted",
  working: "bg-accent/15 text-accent",
  dead: "bg-warn/15 text-warn",
  breach: "bg-warn/20 text-warn",
};

export function Badge({
  tone = "open",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        tones[tone] ?? tones.open,
        className,
      )}
      {...props}
    />
  );
}

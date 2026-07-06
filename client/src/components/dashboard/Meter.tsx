import { cn } from "@/lib/utils";

import type { StatusTone } from "./StatusPill";

type MeterTone = Exclude<StatusTone, "muted">;

const FILL_TONE: Record<MeterTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

// The track is a lighter step of the fill's own hue, so severity reads across
// the whole bar rather than only in the filled portion.
const TRACK_TONE: Record<MeterTone, string> = {
  success: "bg-success/15",
  warning: "bg-warning/15",
  destructive: "bg-destructive/15",
};

// A slim severity bar: the fill carries state (under cap, near, over) and the
// caller decides the tone and how full it reads.
export function Meter({
  fraction,
  tone,
  ariaLabel,
  className,
}: {
  fraction: number;
  tone: MeterTone;
  ariaLabel?: string;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(1, fraction)) * 100;

  // Presentational only: the value it visualizes is always printed in adjacent
  // text, so the bar reinforces rather than being the sole source. The label
  // rides a title for a hover hint.
  return (
    <div title={ariaLabel} className={cn("h-1.5 w-full overflow-hidden rounded-full", TRACK_TONE[tone], className)}>
      <div className={cn("h-full rounded-full", FILL_TONE[tone])} style={{ width: `${percent}%` }} />
    </div>
  );
}

import { daysUntil } from "@/lib/format";

import { StatusPill } from "./StatusPill";

// A deadline read as a status: overdue is destructive, due within a month is
// warning, further out is muted. The number is the day count, never a raw date.
export function DaysLeftPill({ date, now, className }: { date: Date; now?: Date; className?: string }) {
  const reference = now ?? new Date();
  const overdue = date.getTime() < reference.getTime();
  const days = Math.abs(daysUntil(date, reference));

  if (overdue) {
    return (
      <StatusPill tone="destructive" className={className}>
        Overdue {days}d
      </StatusPill>
    );
  }

  return (
    <StatusPill tone={days <= 30 ? "warning" : "muted"} className={className}>
      {days}d
    </StatusPill>
  );
}

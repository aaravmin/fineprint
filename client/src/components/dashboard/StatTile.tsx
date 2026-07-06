import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { InfoHint } from "./InfoHint";

// The only place stat typography lives. A tile is a muted label, one bold value,
// and an optional sub-line; the value uses proportional figures (overriding the
// global card tabular-nums) so a display number never looks loose.
export type StatTone = "default" | "success" | "warning" | "destructive";

const VALUE_TONE: Record<StatTone, string> = {
  default: "",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
  icon,
  tooltip,
  meter,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
  icon?: ReactNode;
  tooltip?: string;
  meter?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card px-4 py-3.5", className)}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon != null ? <span className="[&_svg]:size-4">{icon}</span> : null}
        <span className="text-xs">{label}</span>
        {tooltip ? <InfoHint text={tooltip} /> : null}
      </div>

      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold [font-variant-numeric:normal] @lg/main:text-3xl",
          VALUE_TONE[tone],
        )}
      >
        {value}
      </p>

      {meter != null ? <div className="mt-2">{meter}</div> : null}

      {sub != null ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

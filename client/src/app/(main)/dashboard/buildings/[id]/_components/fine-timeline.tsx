"use client";

import type { FineResult } from "@/lib/engine";
import { fmtUsd } from "@/lib/engine";

const PERIOD_COLORS = ["hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--destructive))"] as const;
const COMPLIANT_COLOR = "hsl(var(--chart-2))";

const W = 640;
const H = 240;
const ML = 80;
const MR = 24;
const MT = 24;
const MB = 64;
const PLOT_W = W - ML - MR;
const PLOT_H = H - MT - MB;
const BAR_W = 110;
const BOTTOM_Y = MT + PLOT_H;

function barX(index: number): number {
  const spacing = (PLOT_W - 3 * BAR_W) / 4;
  return ML + spacing + index * (BAR_W + spacing);
}

function fmtYLabel(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

interface Props {
  periods: FineResult[];
}

export function FineTimeline({ periods }: Props) {
  const maxFine = Math.max(...periods.map(p => p.annualFineUsd), 1);
  const gridMax = Math.ceil(maxFine / 10_000) * 10_000 || 10_000;
  const allCompliant = periods.every(p => p.compliant);

  const barHeight = (fine: number) => Math.max((fine / gridMax) * PLOT_H, fine > 0 ? 4 : 0);
  const barY = (fine: number) => BOTTOM_Y - barHeight(fine);

  const gridLines = [0, 0.5, 1].map(frac => ({
    y: BOTTOM_Y - frac * PLOT_H,
    label: fmtYLabel(frac * gridMax),
  }));

  const cliffMultiplier =
    periods[0].annualFineUsd > 0
      ? (periods[1].annualFineUsd / periods[0].annualFineUsd).toFixed(1)
      : null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-3">
        {!allCompliant && cliffMultiplier && Number(cliffMultiplier) > 1.1 && (
          <p className="text-sm text-destructive font-medium">
            {cliffMultiplier}× jump at the 2030 cliff
          </p>
        )}
        {allCompliant && (
          <p className="text-sm text-green-600 dark:text-green-400 font-medium">
            Compliant across all periods
          </p>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        aria-label="LL97 fine projection by compliance period"
        className="overflow-visible"
      >
        {gridLines.map(({ y, label }) => (
          <g key={y}>
            <line x1={ML} y1={y} x2={W - MR} y2={y} stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
            <text x={ML - 8} y={y + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.5">
              {label}
            </text>
          </g>
        ))}

        {periods.map((p, i) => {
          const x = barX(i);
          const bh = barHeight(p.annualFineUsd);
          const by = barY(p.annualFineUsd);
          const color = p.compliant ? COMPLIANT_COLOR : PERIOD_COLORS[i];

          return (
            <g key={p.period}>
              <rect x={x} y={by} width={BAR_W} height={bh} fill={color} fillOpacity="0.85" rx="4" />
              <text x={x + BAR_W / 2} y={by - 8} textAnchor="middle" fontSize="12" fontWeight="600" fill={color}>
                {fmtUsd(p.annualFineUsd)}
              </text>
              <text x={x + BAR_W / 2} y={BOTTOM_Y + 18} textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity="0.5">
                {p.period}
              </text>
              <text x={x + BAR_W / 2} y={BOTTOM_Y + 34} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.3">
                /yr
              </text>
            </g>
          );
        })}

        {!allCompliant && periods[1].annualFineUsd > periods[0].annualFineUsd && (() => {
          const midX = (barX(0) + BAR_W + barX(1)) / 2;
          const y1 = barY(periods[0].annualFineUsd);
          const y2 = barY(periods[1].annualFineUsd);

          return (
            <g>
              <line
                x1={barX(0) + BAR_W / 2} y1={y1}
                x2={barX(1) + BAR_W / 2} y2={y2}
                stroke="hsl(var(--destructive))" strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.4"
              />
              <text x={midX} y={Math.min(y1, y2) - 10} textAnchor="middle" fontSize="10" fill="hsl(var(--destructive))" fillOpacity="0.7">
                2030 cliff
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

"use client";

import type { FineResult } from "@/lib/engine";
import { fmtUsd } from "@/lib/engine";
import { compactUsd } from "@/lib/format";

const W = 640;
const H = 240;
const ML = 52;
const MR = 16;
const MT = 16;
const MB = 44;
const PLOT_W = W - ML - MR;
const PLOT_H = H - MT - MB;
const BOTTOM_Y = MT + PLOT_H;
const BAND_W = PLOT_W / 3;
const BAR_W = 24;

function bandX(index: number): number {
  return ML + index * BAND_W;
}

function barX(index: number): number {
  return bandX(index) + (BAND_W - BAR_W) / 2;
}

// A rounded top with a square baseline: the bar grows from the axis, so only the
// data-end is softened.
function topRoundedBar(x: number, y: number, width: number, height: number): string {
  const radius = Math.min(4, width / 2, height);
  const bottom = y + height;
  return [
    `M ${x},${bottom}`,
    `L ${x},${y + radius}`,
    `Q ${x},${y} ${x + radius},${y}`,
    `L ${x + width - radius},${y}`,
    `Q ${x + width},${y} ${x + width},${y + radius}`,
    `L ${x + width},${bottom}`,
    "Z",
  ].join(" ");
}

// A clean upper bound for the y-axis: 1, 2, or 5 times a power of ten.
function niceCeil(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

interface Props {
  periods: FineResult[];
}

export function FineTimeline({ periods }: Props) {
  const maxFine = Math.max(...periods.map((period) => period.annualFineUsd), 1);
  const gridMax = niceCeil(maxFine);
  const allCompliant = periods.every((period) => period.compliant);

  const barHeight = (fine: number) => Math.max((fine / gridMax) * PLOT_H, fine > 0 ? 3 : 0);
  const barY = (fine: number) => BOTTOM_Y - barHeight(fine);

  const gridLines = [0, 0.5, 1].map((fraction) => ({
    y: BOTTOM_Y - fraction * PLOT_H,
    label: compactUsd(fraction * gridMax),
  }));

  const cliffMultiplier =
    periods[0].annualFineUsd > 0 ? (periods[1].annualFineUsd / periods[0].annualFineUsd).toFixed(1) : null;
  const showsCliff =
    !allCompliant &&
    cliffMultiplier !== null &&
    Number(cliffMultiplier) > 1.1 &&
    periods[1].annualFineUsd > periods[0].annualFineUsd;

  return (
    <div className="space-y-2">
      <div className="min-h-5 text-sm font-medium">
        {allCompliant ? (
          <p className="text-success">Compliant across all periods</p>
        ) : showsCliff ? (
          <p className="text-destructive">{cliffMultiplier}x jump at the 2030 cliff</p>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="LL97 annual fine projection by compliance period"
        className="overflow-visible"
      >
        {gridLines.map((gridLine) => (
          <g key={gridLine.y}>
            <line x1={ML} y1={gridLine.y} x2={W - MR} y2={gridLine.y} strokeWidth={1} className="stroke-border" />
            <text
              x={ML - 8}
              y={gridLine.y + 4}
              textAnchor="end"
              fontSize={11}
              className="fill-muted-foreground tabular-nums"
            >
              {gridLine.label}
            </text>
          </g>
        ))}

        {showsCliff ? (
          <g>
            <line
              x1={barX(0) + BAR_W / 2}
              y1={barY(periods[0].annualFineUsd)}
              x2={barX(1) + BAR_W / 2}
              y2={barY(periods[1].annualFineUsd)}
              strokeWidth={1}
              strokeDasharray="4 3"
              className="stroke-destructive/50"
            />
            <text
              x={(barX(0) + BAR_W + barX(1)) / 2}
              y={barY(periods[1].annualFineUsd) - 10}
              textAnchor="middle"
              fontSize={10}
              className="fill-muted-foreground"
            >
              2030 cliff
            </text>
          </g>
        ) : null}

        {periods.map((period, index) => {
          const height = barHeight(period.annualFineUsd);
          const top = barY(period.annualFineUsd);
          const isStoryPoint = index === 1 && period.annualFineUsd > 0;

          return (
            <g key={period.period}>
              <path
                d={topRoundedBar(barX(index), top, BAR_W, height)}
                className={period.compliant ? "fill-success" : "fill-destructive"}
              />

              {isStoryPoint ? (
                <text
                  x={barX(index) + BAR_W / 2}
                  y={top - 8}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={600}
                  className="fill-foreground"
                >
                  {compactUsd(period.annualFineUsd)}
                </text>
              ) : null}

              <rect x={bandX(index)} y={MT} width={BAND_W} height={PLOT_H} fill="transparent">
                <title>{`${period.period}: ${fmtUsd(period.annualFineUsd)}/yr`}</title>
              </rect>

              <text
                x={barX(index) + BAR_W / 2}
                y={BOTTOM_Y + 18}
                textAnchor="middle"
                fontSize={12}
                className="fill-muted-foreground"
              >
                {period.period}
              </text>
              <text
                x={barX(index) + BAR_W / 2}
                y={BOTTOM_Y + 32}
                textAnchor="middle"
                fontSize={10}
                className="fill-muted-foreground/70"
              >
                per year
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

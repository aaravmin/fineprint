"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { FineResult } from "@/lib/engine";
import { fmtUsd } from "@/lib/engine";

const DANGER = "#e5342b"; // over the emissions cap
const COMPLIANT = "#15a34a"; // under the cap

const chartConfig = {
  annualFineUsd: { label: "Annual fine" },
} satisfies ChartConfig;

function axisTick(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${Math.round(value / 1_000)}K`;
  }
  return `$${value}`;
}

export function FineTimeline({ periods }: { periods: FineResult[] }) {
  const data = periods.map((period) => ({
    period: period.period,
    tick: `'${period.period.slice(2, 4)}`,
    annualFineUsd: period.annualFineUsd,
    fineLabel: period.annualFineUsd > 0 ? fmtUsd(period.annualFineUsd) : "$0",
    fill: period.compliant ? COMPLIANT : DANGER,
  }));

  return (
    <ChartContainer config={chartConfig} className="aspect-[5/4] w-full">
      <BarChart accessibilityLayer data={data} margin={{ top: 24, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.3} />
        <XAxis dataKey="tick" tickLine={false} axisLine={false} tickMargin={10} />
        <YAxis tickLine={false} axisLine={false} width={44} tickCount={4} tickFormatter={axisTick} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent labelKey="period" formatter={(value) => `${fmtUsd(Number(value))}/yr`} />}
        />
        <Bar dataKey="annualFineUsd" radius={[6, 6, 0, 0]} maxBarSize={80}>
          <LabelList
            dataKey="fineLabel"
            position="top"
            offset={8}
            className="fill-foreground text-[11px] font-semibold tabular-nums"
          />
          {data.map((entry) => (
            <Cell key={entry.period} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

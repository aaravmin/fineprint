"use client";

import { useMemo, useState } from "react";

import { Banknote, ChevronDown, ChevronUp, Leaf, TrendingDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import type { Building } from "@/lib/db/types";
import { computeBudgetPlan, computeRetrofit, DEFAULT_MEASURES, fmtTco2e, fmtUsd, maxRetrofitCapex } from "@/lib/engine";

const measureById = new Map(DEFAULT_MEASURES.map((measure) => [measure.id, measure]));

const STEP_USD = 50_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// One plain sentence describing what the chosen budget buys. The outlook
// section above already carries the chart, so this stays prose, not a panel.
function outcomeLine(
  capexUsd: number,
  emissionsCut: number,
  finesAvoided: number,
  stillFinedPeriods: string[],
  crossCreditedLaws: string[],
): string {
  if (capexUsd === 0) {
    return "No budget committed. The building stays on the fine path shown above.";
  }

  const base =
    stillFinedPeriods.length === 0
      ? `${fmtUsd(capexUsd)} cuts ${fmtTco2e(emissionsCut)} of annual emissions and clears every LL97 cap through 2039, avoiding ${fmtUsd(finesAvoided)} in fines.`
      : `${fmtUsd(capexUsd)} cuts ${fmtTco2e(emissionsCut)} of annual emissions and avoids ${fmtUsd(finesAvoided)}, but a fine still lands in ${stillFinedPeriods.join(", ")}.`;

  if (crossCreditedLaws.length === 0) {
    return base;
  }
  return `${base} These measures also satisfy ${crossCreditedLaws.map((lawId) => lawId.toUpperCase()).join(", ")}.`;
}

// The owner sets a retrofit budget; the page recomputes the whole compliance
// path against that figure using the same pure engine the rest of the page
// uses, run in the browser off the live building row.
export function InvestmentPlanner({ building }: { building: Building }) {
  const assessment = useMemo(() => computeRetrofit(building), [building]);
  const maxCapex = useMemo(() => maxRetrofitCapex(building), [building]);

  const recommendedCapex = assessment?.best.capexUsd ?? 0;
  const [investmentUsd, setInvestmentUsd] = useState(recommendedCapex);

  const plan = useMemo(() => computeBudgetPlan(building, investmentUsd), [building, investmentUsd]);

  if (!assessment || !plan) {
    return null;
  }

  const finesAvoided = Math.max(0, assessment.doNothing.horizonFinesUsd - plan.horizonFinesUsd);
  const emissionsCut = Math.max(0, assessment.doNothing.projectedEmissionsTco2e - plan.projectedEmissionsTco2e);

  const fundedMeasures = plan.measureIds
    .map((id) => measureById.get(id))
    .filter((measure): measure is NonNullable<typeof measure> => Boolean(measure));

  const crossCreditedLaws = Array.from(new Set(fundedMeasures.flatMap((measure) => measure.satisfiesLaws ?? [])));
  const stillFinedPeriods = plan.results.filter((result) => !result.compliant).map((result) => result.period);

  const setInvestment = (next: number) => {
    setInvestmentUsd(clamp(Math.round(next), 0, maxCapex));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model an investment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="investment" className="text-sm font-medium">
              Budget
            </label>
            <div className="flex items-stretch overflow-hidden rounded-lg border border-border focus-within:border-foreground/30">
              <input
                id="investment"
                inputMode="numeric"
                value={investmentUsd === 0 ? "" : `$${investmentUsd.toLocaleString("en-US")}`}
                placeholder="$0"
                onChange={(event) => {
                  const digits = event.target.value.replace(/[^0-9]/g, "");
                  setInvestment(digits ? Number(digits) : 0);
                }}
                className="w-40 bg-transparent px-3 py-1.5 text-right text-sm font-medium tabular-nums outline-none"
              />
              <div className="flex flex-col border-l border-border">
                <button
                  type="button"
                  aria-label="Increase budget"
                  onClick={() => setInvestment(investmentUsd + STEP_USD)}
                  className="flex flex-1 items-center justify-center px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Decrease budget"
                  onClick={() => setInvestment(investmentUsd - STEP_USD)}
                  className="flex flex-1 items-center justify-center border-t border-border px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          <Slider
            value={[investmentUsd]}
            min={0}
            max={maxCapex}
            step={Math.max(1_000, Math.round(maxCapex / 200))}
            onValueChange={(value: number[]) => setInvestment(value[0])}
          />

          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => setInvestment(0)}>
              None
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setInvestment(recommendedCapex)}>
              Recommended
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setInvestment(maxCapex)}>
              Max
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 @sm/main:grid-cols-3">
          <PlannerStat icon={<Banknote className="size-4" />} label="Committed" value={fmtUsd(plan.capexUsd)} />
          <PlannerStat
            icon={<Leaf className="size-4" />}
            label="Emissions"
            value={`${fmtTco2e(plan.projectedEmissionsTco2e)}/yr`}
          />
          <PlannerStat
            icon={<TrendingDown className="size-4" />}
            label="Fines avoided"
            value={fmtUsd(finesAvoided)}
            valueClassName="text-success"
          />
        </div>

        <p className="border-t pt-3 text-sm leading-relaxed text-muted-foreground">
          {outcomeLine(plan.capexUsd, emissionsCut, finesAvoided, stillFinedPeriods, crossCreditedLaws)}
        </p>
      </CardContent>
    </Card>
  );
}

function PlannerStat({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border bg-background px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${valueClassName ?? ""}`}>{value}</p>
    </div>
  );
}

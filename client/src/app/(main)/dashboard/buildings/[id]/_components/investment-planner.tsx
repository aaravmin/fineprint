"use client";

import { useMemo, useState } from "react";

import { Banknote, Leaf, TrendingDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  computeBudgetPlan,
  computeRetrofit,
  DEFAULT_MEASURES,
  fmtTco2e,
  fmtUsd,
  maxRetrofitCapex,
} from "@/lib/engine";
import type { Building } from "@/module_bindings/types";

import { FineTimeline } from "./fine-timeline";

const measureById = new Map(DEFAULT_MEASURES.map(measure => [measure.id, measure]));

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// The owner sets how much they will invest; the page recomputes the whole
// compliance path against that figure. Spend nothing and the fines stand;
// spend more and measures get funded, emissions fall, and the LL97 projection
// going forward changes period by period. All math is the same pure engine the
// rest of the page uses, run in the browser off the live building row.
export function InvestmentPlanner({ building }: { building: Building }) {
  const assessment = useMemo(() => computeRetrofit(building), [building]);
  const maxCapex = useMemo(() => maxRetrofitCapex(building), [building]);

  const recommendedCapex = assessment?.best.capexUsd ?? 0;
  const [investmentUsd, setInvestmentUsd] = useState(recommendedCapex);

  const plan = useMemo(
    () => computeBudgetPlan(building, investmentUsd),
    [building, investmentUsd],
  );

  if (!assessment || !plan) {
    return null;
  }

  const doNothingFines = assessment.doNothing.horizonFinesUsd;
  const finesAvoided = Math.max(0, doNothingFines - plan.horizonFinesUsd);
  const emissionsCut = Math.max(
    0,
    assessment.doNothing.projectedEmissionsTco2e - plan.projectedEmissionsTco2e,
  );

  const fundedMeasures = plan.measureIds
    .map(id => measureById.get(id))
    .filter((measure): measure is NonNullable<typeof measure> => Boolean(measure));

  const crossCreditedLaws = Array.from(
    new Set(fundedMeasures.flatMap(measure => measure.satisfiesLaws ?? [])),
  );

  const setInvestment = (next: number) => {
    setInvestmentUsd(clamp(Math.round(next), 0, maxCapex));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan your investment</CardTitle>
        <p className="text-sm text-muted-foreground">
          Set what you will put toward retrofits and see how it changes the LL97 path
          through 2039. Capex figures are typical-building assumptions, not quotes.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="investment" className="text-sm font-medium">
              Investment
            </label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                id="investment"
                type="number"
                min={0}
                max={maxCapex}
                step={10_000}
                value={investmentUsd}
                onChange={event => setInvestment(Number(event.target.value))}
                className="w-40 text-right tabular-nums"
              />
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
              Do nothing
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setInvestment(recommendedCapex)}
            >
              Optimizer pick ({fmtUsd(recommendedCapex)})
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setInvestment(maxCapex)}
            >
              Everything ({fmtUsd(maxCapex)})
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 @sm/main:grid-cols-3">
          <PlannerStat
            icon={<Banknote className="size-4" />}
            label="Capex committed"
            value={fmtUsd(plan.capexUsd)}
          />
          <PlannerStat
            icon={<Leaf className="size-4" />}
            label="Projected emissions"
            value={`${fmtTco2e(plan.projectedEmissionsTco2e)}/yr`}
          />
          <PlannerStat
            icon={<TrendingDown className="size-4" />}
            label="Fines avoided through 2039"
            value={fmtUsd(finesAvoided)}
            valueClassName="text-success"
          />
        </div>

        {fundedMeasures.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {fundedMeasures.map(measure => (
              <Badge key={measure.id} variant="secondary">
                {measure.name}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No measures funded at this budget — the building keeps its current emissions.
          </p>
        )}

        <FineTimeline periods={plan.results} />

        <PathSummary
          address={building.address}
          investmentUsd={plan.capexUsd}
          emissionsCut={emissionsCut}
          finesAvoided={finesAvoided}
          results={plan.results}
          crossCreditedLaws={crossCreditedLaws}
        />
      </CardContent>
    </Card>
  );
}

function PathSummary({
  address,
  investmentUsd,
  emissionsCut,
  finesAvoided,
  results,
  crossCreditedLaws,
}: {
  address: string;
  investmentUsd: number;
  emissionsCut: number;
  finesAvoided: number;
  results: { period: string; compliant: boolean; annualFineUsd: number }[];
  crossCreditedLaws: string[];
}) {
  const stillFined = results.filter(result => !result.compliant);

  return (
    <div className="space-y-2 border-t pt-3 text-sm leading-relaxed">
      {investmentUsd === 0 ? (
        <p>
          With nothing invested, <span className="font-medium">{address}</span> keeps its
          current emissions and stays on the existing fine path above.
        </p>
      ) : stillFined.length === 0 ? (
        <p>
          Investing <span className="font-medium">{fmtUsd(investmentUsd)}</span> cuts{" "}
          <span className="font-medium">{fmtTco2e(emissionsCut)}</span> of annual emissions
          and brings <span className="font-medium">{address}</span> under every LL97 cap
          through 2039 — <span className="font-medium text-success">no fines remain</span>,
          avoiding {fmtUsd(finesAvoided)}.
        </p>
      ) : (
        <p>
          Investing <span className="font-medium">{fmtUsd(investmentUsd)}</span> cuts{" "}
          <span className="font-medium">{fmtTco2e(emissionsCut)}</span> of annual emissions
          and avoids <span className="font-medium text-success">{fmtUsd(finesAvoided)}</span>
          , but the building still owes a fine in{" "}
          <span className="font-medium text-destructive">
            {stillFined.map(result => result.period).join(", ")}
          </span>{" "}
          — close the remaining gap to reach $0.
        </p>
      )}

      {crossCreditedLaws.length > 0 && (
        <p className="text-muted-foreground">
          These measures also satisfy{" "}
          {crossCreditedLaws.map(lawId => lawId.toUpperCase()).join(", ")}, retiring those
          filing obligations in the same spend.
        </p>
      )}
    </div>
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
      <p className={`mt-1 text-lg font-semibold tabular-nums ${valueClassName ?? ""}`}>
        {value}
      </p>
    </div>
  );
}

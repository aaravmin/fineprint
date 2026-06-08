"use client";

import { useState } from "react";

import { Banknote, Leaf, RotateCcw, Sparkles, TrendingDown, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  computeBudgetPlan,
  fmtTco2e,
  fmtUsd,
  type FundedPlan,
  type RetrofitAssessment,
} from "@/lib/engine";
import type { Building } from "@/module_bindings/types";

// Owners fund in whole $500 steps — anything finer is noise on a retrofit quote.
const STEP = 500;

function snap(value: number, max: number): number {
  const snapped = Math.round(value / STEP) * STEP;
  return Math.min(Math.max(snapped, 0), max);
}

// Per-measure investment: the owner decides how much to put into each measure,
// and a partially funded measure delivers that fraction of its carbon cut. The
// page recomputes the whole LL97 path against the funding split, live. Funding
// state is owned by the parent so the same numbers drive the chart and export.
export function InvestmentPlanner({
  building,
  plan,
  assessment,
  funding,
  onFundingChange,
}: {
  building: Building;
  plan: FundedPlan;
  assessment: RetrofitAssessment;
  funding: Record<string, number>;
  onFundingChange: (next: Record<string, number>) => void;
}) {
  const [budgetInput, setBudgetInput] = useState(() =>
    snap(assessment.best.capexUsd, Number.MAX_SAFE_INTEGER),
  );
  const doNothingFines = assessment.doNothing.horizonFinesUsd;
  const finesAvoided = Math.max(0, doNothingFines - plan.horizonFinesUsd);
  const emissionsCut = Math.max(
    0,
    plan.baselineEmissionsTco2e - plan.projectedEmissionsTco2e,
  );
  const allCompliant = plan.results.every(result => result.compliant);

  const crossCreditedLaws = Array.from(
    new Set(
      plan.measures
        .filter(measure => measure.fundedFraction >= 1)
        .flatMap(measure => measure.satisfiesLaws ?? []),
    ),
  );

  const setMeasure = (id: string, value: number, max: number) => {
    onFundingChange({ ...funding, [id]: snap(value, max) });
  };

  const fundAll = () => {
    const next: Record<string, number> = {};
    for (const measure of plan.measures) {
      next[measure.id] = measure.fullCostUsd;
    }
    onFundingChange(next);
  };

  const clearAll = () => onFundingChange({});

  const optimizerPick = () => {
    const picks = new Set(assessment.best.measureIds);
    const next: Record<string, number> = {};
    for (const measure of plan.measures) {
      next[measure.id] = picks.has(measure.id) ? measure.fullCostUsd : 0;
    }
    onFundingChange(next);
  };

  // "I can spend $X — what's the best use of it?" The engine finds the measure
  // set within budget that leaves the lowest fines through 2039; we fully fund
  // exactly those measures.
  const optimizeForBudget = () => {
    const budgetPlan = computeBudgetPlan(building, snap(budgetInput, Number.MAX_SAFE_INTEGER));
    if (!budgetPlan) {
      return;
    }

    const picks = new Set(budgetPlan.measureIds);
    const next: Record<string, number> = {};
    for (const measure of plan.measures) {
      next[measure.id] = picks.has(measure.id) ? measure.fullCostUsd : 0;
    }
    onFundingChange(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan your investment</CardTitle>
        <p className="text-sm text-muted-foreground">
          Fund each measure as much as you like — a half-funded measure delivers half
          its carbon cut. The LL97 path through 2039 updates as you go. Capex figures are
          typical-building assumptions, not quotes.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={clearAll}>
            <RotateCcw className="mr-1 size-3.5" /> Clear
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={optimizerPick}>
            <Wand2 className="mr-1 size-3.5" /> Optimizer pick
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={fundAll}>
            Fund all ({fmtUsd(plan.measures.reduce((sum, m) => sum + m.fullCostUsd, 0))})
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-muted/30 px-4 py-3">
          <div className="space-y-1">
            <label htmlFor="budget" className="text-xs font-medium text-muted-foreground">
              Optimize a budget
            </label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                id="budget"
                type="number"
                min={0}
                step={STEP}
                value={budgetInput}
                onChange={event =>
                  setBudgetInput(snap(Number(event.target.value), Number.MAX_SAFE_INTEGER))
                }
                className="w-40 text-right tabular-nums"
              />
            </div>
          </div>
          <Button type="button" size="sm" onClick={optimizeForBudget}>
            <Sparkles className="mr-1 size-3.5" /> Optimize spend
          </Button>
          <p className="text-xs text-muted-foreground">
            Funds the measure set that leaves the lowest fines for what you can spend.
          </p>
        </div>

        <div className="space-y-2.5">
          {plan.measures.map(measure => (
            <div
              key={measure.id}
              className="space-y-2 rounded-xl border bg-background px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{measure.name}</p>
                  <p className="text-xs text-muted-foreground">{measure.basis}</p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  full cost {fmtUsd(measure.fullCostUsd)}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Slider
                  value={[measure.fundedUsd]}
                  min={0}
                  max={measure.fullCostUsd}
                  step={STEP}
                  onValueChange={(value: number[]) =>
                    setMeasure(measure.id, value[0], measure.fullCostUsd)
                  }
                  className="flex-1"
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min={0}
                    max={measure.fullCostUsd}
                    step={STEP}
                    value={measure.fundedUsd}
                    onChange={event =>
                      setMeasure(measure.id, Number(event.target.value), measure.fullCostUsd)
                    }
                    className="w-32 text-right tabular-nums"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground tabular-nums">
                  {Math.round(measure.fundedFraction * 100)}% funded
                </span>
                <span
                  className={
                    measure.emissionsCutTco2e > 0
                      ? "font-medium text-success"
                      : "text-muted-foreground"
                  }
                >
                  −{fmtTco2e(measure.emissionsCutTco2e)}/yr
                </span>
              </div>
            </div>
          ))}
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

        <PathSummary
          investmentUsd={plan.capexUsd}
          emissionsCut={emissionsCut}
          finesAvoided={finesAvoided}
          allCompliant={allCompliant}
          stillFinedPeriods={plan.results
            .filter(result => !result.compliant)
            .map(result => result.period)}
          crossCreditedLaws={crossCreditedLaws}
        />
      </CardContent>
    </Card>
  );
}

function PathSummary({
  investmentUsd,
  emissionsCut,
  finesAvoided,
  allCompliant,
  stillFinedPeriods,
  crossCreditedLaws,
}: {
  investmentUsd: number;
  emissionsCut: number;
  finesAvoided: number;
  allCompliant: boolean;
  stillFinedPeriods: string[];
  crossCreditedLaws: string[];
}) {
  return (
    <div className="space-y-2 border-t pt-3 text-sm leading-relaxed">
      {investmentUsd === 0 ? (
        <p>
          With nothing invested, the building keeps its current emissions and stays on the
          existing fine path above.
        </p>
      ) : allCompliant ? (
        <p>
          Investing <span className="font-medium">{fmtUsd(investmentUsd)}</span> cuts{" "}
          <span className="font-medium">{fmtTco2e(emissionsCut)}</span> of annual emissions
          and brings the building under every LL97 cap through 2039 —{" "}
          <span className="font-medium text-success">no fines remain</span>, avoiding{" "}
          {fmtUsd(finesAvoided)}.
        </p>
      ) : (
        <p>
          Investing <span className="font-medium">{fmtUsd(investmentUsd)}</span> cuts{" "}
          <span className="font-medium">{fmtTco2e(emissionsCut)}</span> of annual emissions
          and avoids{" "}
          <span className="font-medium text-success">{fmtUsd(finesAvoided)}</span>, but the
          building still owes a fine in{" "}
          <span className="font-medium text-destructive">
            {stillFinedPeriods.join(", ")}
          </span>{" "}
          — fund more of the deeper measures to close the gap.
        </p>
      )}

      {crossCreditedLaws.length > 0 && (
        <p className="text-muted-foreground">
          Fully funded measures also satisfy{" "}
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

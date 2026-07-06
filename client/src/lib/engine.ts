import {
  type BuildingInput,
  categoryForSystem,
  computeAllPeriods,
  DEFAULT_MEASURES,
  type FineResult,
  type FundedPlan,
  fullCostFor,
  optimizeRetrofit,
  planForBudget,
  planFromFunding,
  type RetrofitAssessment,
  type RetrofitMeasure,
  type RetrofitPlan,
  // biome-ignore lint/correctness/noUndeclaredDependencies: fineprint-engine is a tsconfig path alias to ../engine/src, resolved by TS and Turbopack, not an npm package.
} from "fineprint-engine";

import type { PersonalizedMeasure } from "@/lib/compliance/plan";
import type { Building } from "@/lib/data/types";

export type { FineResult, FundedPlan, RetrofitAssessment, RetrofitMeasure, RetrofitPlan };
export { DEFAULT_MEASURES };

export function toBuildingInput(building: Building): BuildingInput | null {
  if (building.annualEmissionsTco2E === undefined || building.usesJson === undefined) {
    return null;
  }
  const occupancyGroups: Array<{ group: string; sqft: number }> = JSON.parse(building.usesJson);
  return {
    grossFloorAreaSqft: building.sqft,
    occupancyGroups,
    annualEmissionsTco2e: building.annualEmissionsTco2E,
    isArticle321: building.isAffordable,
  };
}

export function computePeriods(building: Building): FineResult[] | null {
  const input = toBuildingInput(building);
  if (!input) return null;
  try {
    return computeAllPeriods(input);
  } catch {
    return null;
  }
}

// Turn a building's personalized measures into engine measures so the live ROI
// sliders run on the SAME building-specific catalog the server computed, not the
// 7 generic DEFAULT_MEASURES. Recovers each measure's real capex as its slider
// max (fullCost = capexUsdPerSqft * sqft). Includes readiness/enabling measures
// (reducesEmissions === false) as cost-only lines. This is what makes every
// applicable measure fundable instead of only the 5 that overlapped the generic
// catalog. Mirrors the server's toEngineMeasures (data/src/retrofit.ts).
export function personalizedEngineMeasures(
  building: Building,
  measures: PersonalizedMeasure[],
): RetrofitMeasure[] {
  const sqft = building.sqft;
  return measures
    .filter(
      (measure) =>
        measure.capexUsd != null &&
        (measure.applicability === "recommended" || measure.applicability === "applicable") &&
        ((measure.effectiveReductionFraction ?? 0) > 0 || measure.reducesEmissions === false),
    )
    .map((measure) => ({
      id: measure.id,
      name: measure.name,
      basis: measure.capexBasis || measure.why,
      capexUsdPerSqft: sqft > 0 ? Math.max(0, measure.capexUsd ?? 0) / sqft : 0,
      emissionsReductionFraction: measure.effectiveReductionFraction ?? 0,
      category: measure.category ?? categoryForSystem(measure.targetSystem),
      targetSystem: measure.targetSystem,
      exclusiveGroup: measure.exclusiveGroup,
      reducesEmissions: measure.reducesEmissions,
    }));
}

// Same guard as computePeriods; the optimizer is pure engine code, so the
// browser can run all subsets locally off the live building row. `measures`
// defaults to the generic catalog for buildings with no personalization.
export function computeRetrofit(
  building: Building,
  measures: RetrofitMeasure[] = DEFAULT_MEASURES,
): RetrofitAssessment | null {
  const input = toBuildingInput(building);
  if (!input) return null;
  try {
    return optimizeRetrofit(input, measures);
  } catch {
    return null;
  }
}

// The best compliance path a given investment can buy, recomputed live as the
// owner edits the figure. Same browser-side enumeration as computeRetrofit.
export function computeBudgetPlan(building: Building, budgetUsd: number): RetrofitPlan | null {
  const input = toBuildingInput(building);
  if (!input) return null;
  try {
    return planForBudget(input, budgetUsd);
  } catch {
    return null;
  }
}

// The full-catalog capex: the most an owner could spend, used to bound the
// investment slider.
export function maxRetrofitCapex(building: Building): number {
  return DEFAULT_MEASURES.reduce((sum, measure) => sum + measure.capexUsdPerSqft * building.sqft, 0);
}

// The compliance path a per-measure funding split buys, recomputed live as the
// owner moves each measure's dollars. Same pure engine the rest of the page
// uses, run in the browser off the live building row.
export function computeFundedPlan(
  building: Building,
  fundingByMeasureId: Record<string, number>,
  measures: RetrofitMeasure[] = DEFAULT_MEASURES,
): FundedPlan | null {
  const input = toBuildingInput(building);
  if (!input) return null;
  try {
    return planFromFunding(input, fundingByMeasureId, measures);
  } catch {
    return null;
  }
}

// The full implementation cost of every measure for this building, keyed by
// measure id — the upper bound on each per-measure slider.
export function measureFullCosts(
  building: Building,
  measures: RetrofitMeasure[] = DEFAULT_MEASURES,
): Record<string, number> {
  return Object.fromEntries(measures.map((measure) => [measure.id, fullCostFor(measure, building.sqft)]));
}

export function fmtUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function fmtTco2e(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} tCO₂e`;
}

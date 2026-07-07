import {
  type BuildingInput,
  computeAllPeriods,
  DEFAULT_MEASURES,
  type FineResult,
  type FundedPlan,
  fullCostFor,
  optimizeRetrofit,
  planForBudget,
  planFromFunding,
  type RetrofitAssessment,
  type RetrofitPlan,
} from "fineprint-engine";

import type { Building } from "@/lib/db/types";

export type { BuildingInput, FineResult, FundedPlan, RetrofitAssessment, RetrofitPlan };
export { computeAllPeriods, DEFAULT_MEASURES };

export function toBuildingInput(building: Building): BuildingInput | null {
  if (building.annualEmissionsTco2e === undefined || building.usesJson === undefined) {
    return null;
  }

  // usesJson is city-sourced text; a malformed payload must degrade to null,
  // not throw past every compute guard and white-screen the page.
  let occupancyGroups: Array<{ group: string; sqft: number }>;
  try {
    occupancyGroups = JSON.parse(building.usesJson);
  } catch {
    return null;
  }

  return {
    grossFloorAreaSqft: building.sqft,
    occupancyGroups,
    annualEmissionsTco2e: building.annualEmissionsTco2e,
    isArticle321: building.isAffordable,
  };
}

export function computePeriods(building: Building): FineResult[] | null {
  const input = toBuildingInput(building);
  if (!input) return null;
  try {
    return computeAllPeriods(input);
  } catch (error) {
    console.error(`[engine] fine computation failed for building ${building.id}: ${(error as Error).message}`);
    return null;
  }
}

// Same guard as computePeriods; the optimizer is pure engine code, so the
// browser can run all 128 subsets locally off the live building row.
export function computeRetrofit(building: Building): RetrofitAssessment | null {
  const input = toBuildingInput(building);
  if (!input) return null;
  try {
    return optimizeRetrofit(input);
  } catch (error) {
    console.error(`[engine] retrofit optimization failed for building ${building.id}: ${(error as Error).message}`);
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
  } catch (error) {
    console.error(`[engine] budget plan failed for building ${building.id}: ${(error as Error).message}`);
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
export function computeFundedPlan(building: Building, fundingByMeasureId: Record<string, number>): FundedPlan | null {
  const input = toBuildingInput(building);
  if (!input) return null;
  try {
    return planFromFunding(input, fundingByMeasureId);
  } catch (error) {
    console.error(`[engine] funded plan failed for building ${building.id}: ${(error as Error).message}`);
    return null;
  }
}

// The full implementation cost of every measure for this building, keyed by
// measure id — the upper bound on each per-measure slider.
export function measureFullCosts(building: Building): Record<string, number> {
  return Object.fromEntries(DEFAULT_MEASURES.map((measure) => [measure.id, fullCostFor(measure, building.sqft)]));
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

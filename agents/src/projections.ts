// Engine projections for drafts: DraftInput -> engine BuildingInput -> all
// three compliance periods. The engine does every calculation; this module
// only converts and formats. Drafts that lack the data simply omit the
// table — no numbers are ever invented.

import { computeAllPeriods, type FineResult } from "../../engine/src/index.ts";
import { optimizeRetrofit, type RetrofitAssessment } from "../../engine/src/retrofit.ts";
import type { DraftInput } from "./policies/types.ts";

export function projectFines(input: DraftInput): FineResult[] | null {
  if (input.annualEmissionsTco2e === undefined || input.uses.length === 0) {
    return null;
  }

  try {
    return computeAllPeriods({
      grossFloorAreaSqft: input.sqft,
      occupancyGroups: input.uses,
      annualEmissionsTco2e: input.annualEmissionsTco2e,
      isArticle321: input.isAffordable,
    });
  } catch {
    // The engine validates its inputs (unknown use names, areas exceeding
    // the lot); data that fails validation gets no projection.
    return null;
  }
}

// Same conversion, handed to the optimizer. Null when the draft lacks the
// data or the engine rejects it — identical guard to projectFines.
export function projectRetrofit(input: DraftInput): RetrofitAssessment | null {
  if (input.annualEmissionsTco2e === undefined || input.uses.length === 0) {
    return null;
  }

  try {
    return optimizeRetrofit({
      grossFloorAreaSqft: input.sqft,
      occupancyGroups: input.uses,
      annualEmissionsTco2e: input.annualEmissionsTco2e,
      isArticle321: input.isAffordable,
    });
  } catch {
    return null;
  }
}

export function renderRetrofitLines(assessment: RetrofitAssessment): string[] {
  const best = assessment.best;
  if (best.measureIds.length === 0) {
    return [];
  }

  return [
    "Cheapest path to compliance (capex assumptions, not quotes):",
    `  measures: ${best.measureIds.join(", ")}`,
    `  capex $${best.capexUsd.toLocaleString("en-US")} -> ` +
      `${best.projectedEmissionsTco2e.toLocaleString("en-US")} tCO2e/yr, ` +
      `avoids $${assessment.finesAvoidedUsd.toLocaleString("en-US")} in fines through 2039`,
  ];
}

export function renderCliffTable(projections: FineResult[]): string {
  const rows = projections.map(result => {
    const limit = result.emissionsLimitTco2e.toLocaleString("en-US");
    const overage = result.overageTco2e.toLocaleString("en-US");
    const fine = result.annualFineUsd.toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });

    return `  ${result.period}  limit ${limit} tCO2e  overage ${overage}  fine $${fine}/yr`;
  });

  return ["Fine projection (computed by the fine engine, not estimated):", ...rows].join(
    "\n",
  );
}

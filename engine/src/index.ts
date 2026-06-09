// Fineprint engine: deterministic NYC Local Law 97 fine calculations.
//
// This package is the single source of every number shown to users. All
// functions are pure — same input, same output. No clocks, no network,
// no environment. Money is handled in integer cents internally and exposed
// as USD numbers at this boundary; emissions are tCO2e.

import {
  ESPM_FACTORS_TCO2E_PER_SQFT,
  OCCUPANCY_GROUP_ESPM_PROXY,
  OCCUPANCY_GROUP_LIMITS_TCO2E_PER_SQFT,
  PENALTY_RATE_CENTS_PER_TCO2E,
  PERIOD_COLUMN,
} from "./constants.ts";

export interface BuildingInput {
  grossFloorAreaSqft: number;
  occupancyGroups: Array<{ group: string; sqft: number }>; // mixed-use buildings split area by use
  annualEmissionsTco2e: number; // actual reported/computed emissions
  isArticle321?: boolean; // rent-regulated / affordable pathway
}

export type Period = "2024-2029" | "2030-2034" | "2035-2039";

export interface FineResult {
  period: Period;
  emissionsLimitTco2e: number;
  actualEmissionsTco2e: number;
  overageTco2e: number; // 0 if compliant
  annualFineUsd: number; // 0 if compliant
  compliant: boolean;
  pathway: "standard" | "article321";
  notes: string[]; // estimate caveats, unverified flags
}

export function computeFine(building: BuildingInput, period: Period): FineResult {
  validateBuilding(building);
  validatePeriod(period);

  if (building.isArticle321) {
    return computeArticle321Result(building, period);
  }

  const notes: string[] = [];

  const limitTco2e = building.occupancyGroups.reduce(
    (sum, space) => sum + factorFor(space.group, period, notes) * space.sqft,
    0,
  );

  // Penalty per 1 RCNY 103-14(h): the overage multiplied by $268. The rule
  // specifies no rounding convention, so the math runs at full precision and
  // rounds only here at the boundary — tCO2e to two decimals (matching DOB's
  // published example), money to the cent.
  const overageTco2e = Math.max(0, building.annualEmissionsTco2e - limitTco2e);
  const fineCents = Math.round(overageTco2e * PENALTY_RATE_CENTS_PER_TCO2E);

  return {
    period,
    emissionsLimitTco2e: roundTco2e(limitTco2e),
    actualEmissionsTco2e: building.annualEmissionsTco2e,
    overageTco2e: roundTco2e(overageTco2e),
    annualFineUsd: fineCents / 100,
    compliant: fineCents === 0,
    pathway: "standard",
    notes,
  };
}

export function computeAllPeriods(building: BuildingInput): FineResult[] {
  const periods: Period[] = ["2024-2029", "2030-2034", "2035-2039"];

  return periods.map(period => computeFine(building, period));
}

// Article 321 buildings (rent-regulated, HDFC, project-based federal housing,
// A-3 worship) are exempt from the $268/tCO2e penalty. They comply once, by
// either implementing the prescribed energy conservation measures of Admin
// Code 28-321.2.2 or showing 2024 emissions under their 2030 limit
// (28-321.2.1). Non-compliance draws flat $10,000 penalties per the DOB
// Article 321 Filing Guide — a different regime this engine does not model.
// The 2030-2034 limit is reported as the future performance target.
function computeArticle321Result(building: BuildingInput, period: Period): FineResult {
  const notes: string[] = [];

  const targetLimitTco2e = building.occupancyGroups.reduce(
    (sum, space) => sum + factorFor(space.group, "2030-2034", notes) * space.sqft,
    0,
  );

  note(
    notes,
    "Article 321 building: complies through prescribed energy conservation " +
      "measures (Admin Code 28-321.2.2) or by meeting its 2030 limit early " +
      "(28-321.2.1), not through the $268/tCO2e penalty. The limit shown is " +
      "the 2030 target. Flat $10,000 non-compliance penalties are not modeled.",
  );

  return {
    period,
    emissionsLimitTco2e: roundTco2e(targetLimitTco2e),
    actualEmissionsTco2e: building.annualEmissionsTco2e,
    overageTco2e: 0,
    annualFineUsd: 0,
    compliant: true,
    pathway: "article321",
    notes,
  };
}

function factorFor(group: string, period: Period, notes: string[]): number {
  const espmFactors = ESPM_FACTORS_TCO2E_PER_SQFT[group];
  if (espmFactors) {
    return espmFactors[PERIOD_COLUMN[period]];
  }

  const statutoryLimits = OCCUPANCY_GROUP_LIMITS_TCO2E_PER_SQFT[group];
  if (!statutoryLimits) {
    const validGroups = [
      ...Object.keys(OCCUPANCY_GROUP_LIMITS_TCO2E_PER_SQFT),
      ...Object.keys(ESPM_FACTORS_TCO2E_PER_SQFT),
    ];
    throw new Error(
      `"${group}" is not a known occupancy group or ESPM property type. ` +
        `Valid values: ${validGroups.join(", ")}`,
    );
  }

  // The statute's occupancy-group tables stop at 2034; 2035-2039 limits exist
  // only per ESPM property type, so a letter group falls back to its proxy
  // type and the result is flagged as an estimate.
  if (period === "2035-2039") {
    const proxyType = OCCUPANCY_GROUP_ESPM_PROXY[group];
    note(
      notes,
      `2035-2039 limits are defined per ESPM property type, not occupancy group; ` +
        `"${group}" was estimated using the "${proxyType}" factor (unofficial mapping).`,
    );
    return ESPM_FACTORS_TCO2E_PER_SQFT[proxyType][PERIOD_COLUMN[period]];
  }

  note(
    notes,
    `Limit for "${group}" uses the statutory occupancy-group table (Admin Code ` +
      `28-320.3); DOB's rule computes against ESPM property-type factors, which ` +
      `can differ. Treat this as an estimate.`,
  );
  return statutoryLimits[PERIOD_COLUMN[period] as 0 | 1];
}

function validateBuilding(building: BuildingInput): void {
  if (!Number.isFinite(building.grossFloorAreaSqft) || building.grossFloorAreaSqft < 0) {
    throw new Error(
      `gross floor area must be a non-negative number, got ${building.grossFloorAreaSqft}`,
    );
  }

  if (
    !Number.isFinite(building.annualEmissionsTco2e) ||
    building.annualEmissionsTco2e < 0
  ) {
    throw new Error(
      `annual emissions must be a non-negative number of tCO2e, got ${building.annualEmissionsTco2e}`,
    );
  }

  if (building.occupancyGroups.length === 0) {
    throw new Error("building needs at least one occupancy group to compute a limit");
  }

  for (const space of building.occupancyGroups) {
    if (!Number.isFinite(space.sqft) || space.sqft < 0) {
      throw new Error(
        `occupancy group "${space.group}" has an invalid area of ${formatSqft(space.sqft)} sqft`,
      );
    }
  }

  const totalGroupSqft = building.occupancyGroups.reduce(
    (sum, space) => sum + space.sqft,
    0,
  );
  if (totalGroupSqft > building.grossFloorAreaSqft) {
    throw new Error(
      `occupancy group areas total ${formatSqft(totalGroupSqft)} sqft, which exceeds ` +
        `the gross floor area of ${formatSqft(building.grossFloorAreaSqft)} sqft`,
    );
  }
}

function validatePeriod(period: Period): void {
  if (!(period in PERIOD_COLUMN)) {
    throw new Error(
      `"${period}" is not a known period; valid periods are ${Object.keys(PERIOD_COLUMN).join(", ")}`,
    );
  }
}

function formatSqft(value: number): string {
  return value.toLocaleString("en-US");
}

function note(notes: string[], text: string): void {
  if (!notes.includes(text)) {
    notes.push(text);
  }
}

function roundTco2e(value: number): number {
  return Math.round(value * 100) / 100;
}

// Retrofit optimizer lives in its own module; re-exported here so package
// consumers (the dashboard's alias points at this file) get one entry point.
export {
  optimizeRetrofit,
  planForBudget,
  planFromFunding,
  fullCostFor,
  DEFAULT_MEASURES,
  type RetrofitMeasure,
  type RetrofitPlan,
  type FundedMeasure,
  type FundedPlan,
  type MaccPoint,
  type RetrofitAssessment,
} from "./retrofit.ts";

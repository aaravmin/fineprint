// Retrofit optimizer: exact enumeration over measure subsets, a marginal
// abatement cost curve, and total-cost minimization against LL97 fines.
// Pure — every dollar of fines comes from computeFine; this module adds only
// capex arithmetic and subset enumeration. Capex and savings figures are
// editorial assumptions for typical NYC buildings, never quotes, and every
// consumer is expected to say so.

import {
  computeFine,
  type BuildingInput,
  type FineResult,
  type Period,
} from "./index.ts";

export interface RetrofitMeasure {
  id: string;
  name: string;
  capexUsdPerSqft: number;
  emissionsReductionFraction: number; // of current emissions, multiplicative
  basis: string; // where the assumption comes from
}

export const DEFAULT_MEASURES: RetrofitMeasure[] = [
  {
    id: "hvac_controls",
    name: "BMS scheduling and controls optimization",
    capexUsdPerSqft: 1.0,
    emissionsReductionFraction: 0.06,
    basis: "NYSERDA real-time energy management program typical savings",
  },
  {
    id: "led_lighting",
    name: "LED lighting completion",
    capexUsdPerSqft: 2.5,
    emissionsReductionFraction: 0.08,
    basis: "DOE solid-state lighting retrofit studies",
  },
  {
    id: "air_sealing",
    name: "Envelope air sealing and insulation",
    capexUsdPerSqft: 3.0,
    emissionsReductionFraction: 0.05,
    basis: "Urban Green Council retrofit guidance",
  },
  {
    id: "heating_plant",
    name: "Heating plant burner and distribution upgrade",
    capexUsdPerSqft: 4.0,
    emissionsReductionFraction: 0.1,
    basis: "NYC Accelerator case studies",
  },
  {
    id: "solar_pv",
    name: "Rooftop solar PV",
    capexUsdPerSqft: 5.0,
    emissionsReductionFraction: 0.03,
    basis: "NYSERDA NY-Sun cost data",
  },
  {
    id: "heat_pumps",
    name: "Partial heat pump electrification",
    capexUsdPerSqft: 12.0,
    emissionsReductionFraction: 0.2,
    basis: "NYC Accelerator electrification studies",
  },
  {
    id: "windows",
    name: "High-performance window replacement",
    capexUsdPerSqft: 15.0,
    emissionsReductionFraction: 0.07,
    basis: "Urban Green Council deep retrofit data",
  },
];

const PERIOD_YEARS: Record<Period, number> = {
  "2024-2029": 6,
  "2030-2034": 5,
  "2035-2039": 5,
};
const HORIZON_YEARS = 16; // 2024 through 2039
const MAX_CATALOG = 12; // 2^12 = 4,096 subsets; enumeration stays instant

export interface RetrofitPlan {
  measureIds: string[];
  capexUsd: number;
  projectedEmissionsTco2e: number;
  horizonFinesUsd: number; // sum of annual fines x years in each period
  totalCostUsd: number; // capex + horizon fines
  results: FineResult[];
}

export interface MaccPoint {
  measureId: string;
  name: string;
  annualReductionTco2e: number;
  usdPerTco2e: number; // capex per tonne abated over the horizon
  basis: string;
}

export interface RetrofitAssessment {
  doNothing: RetrofitPlan;
  best: RetrofitPlan;
  finesAvoidedUsd: number;
  macc: MaccPoint[];
  evaluatedSubsets: number;
  notes: string[];
}

export function optimizeRetrofit(
  building: BuildingInput,
  measures: RetrofitMeasure[] = DEFAULT_MEASURES,
): RetrofitAssessment {
  if (measures.length > MAX_CATALOG) {
    throw new Error(
      `catalog of ${measures.length} exceeds the ${MAX_CATALOG}-measure enumeration cap`,
    );
  }

  const subsetCount = 2 ** measures.length;
  let doNothing: RetrofitPlan | null = null;
  let best: RetrofitPlan | null = null;

  for (let mask = 0; mask < subsetCount; mask++) {
    const chosen = measures.filter((_, index) => mask & (1 << index));
    const plan = evaluatePlan(building, chosen);

    if (mask === 0) {
      doNothing = plan;
    }
    if (!best || plan.totalCostUsd < best.totalCostUsd) {
      best = plan;
    }
  }

  const notes = [
    "Capex and savings are typical-building assumptions, not quotes; every measure names its basis.",
  ];
  if (building.isArticle321) {
    notes.push(
      "Article 321 buildings face flat penalties rather than $268/tCO2e; the optimizer compares capex against the engine's Article 321 results.",
    );
  }

  return {
    doNothing: doNothing!,
    best: best!,
    finesAvoidedUsd: round2(doNothing!.horizonFinesUsd - best!.horizonFinesUsd),
    macc: maccCurve(building, measures),
    evaluatedSubsets: subsetCount,
    notes,
  };
}

function evaluatePlan(building: BuildingInput, chosen: RetrofitMeasure[]): RetrofitPlan {
  const capexUsd = chosen.reduce(
    (sum, measure) => sum + measure.capexUsdPerSqft * building.grossFloorAreaSqft,
    0,
  );

  const remainingFraction = chosen.reduce(
    (fraction, measure) => fraction * (1 - measure.emissionsReductionFraction),
    1,
  );
  const projectedEmissionsTco2e = building.annualEmissionsTco2e * remainingFraction;

  const adjusted = { ...building, annualEmissionsTco2e: projectedEmissionsTco2e };
  const results = (Object.keys(PERIOD_YEARS) as Period[]).map(period =>
    computeFine(adjusted, period),
  );

  const horizonFinesUsd = results.reduce(
    (sum, result) => sum + result.annualFineUsd * PERIOD_YEARS[result.period],
    0,
  );

  return {
    measureIds: chosen.map(measure => measure.id),
    capexUsd: round2(capexUsd),
    projectedEmissionsTco2e: round2(projectedEmissionsTco2e),
    horizonFinesUsd: round2(horizonFinesUsd),
    totalCostUsd: round2(capexUsd + horizonFinesUsd),
    results,
  };
}

function maccCurve(building: BuildingInput, measures: RetrofitMeasure[]): MaccPoint[] {
  return measures
    .map(measure => {
      const capexUsd = measure.capexUsdPerSqft * building.grossFloorAreaSqft;
      const annualReductionTco2e =
        building.annualEmissionsTco2e * measure.emissionsReductionFraction;

      return {
        measureId: measure.id,
        name: measure.name,
        annualReductionTco2e: round2(annualReductionTco2e),
        usdPerTco2e:
          annualReductionTco2e === 0
            ? Infinity
            : round2(capexUsd / (annualReductionTco2e * HORIZON_YEARS)),
        basis: measure.basis,
      };
    })
    .sort((a, b) => a.usdPerTco2e - b.usdPerTco2e);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

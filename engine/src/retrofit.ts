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
  // Procedural laws this physical measure also satisfies when implemented, so a
  // whole-building plan can credit one action against several laws rather than
  // double-count it. Pure metadata — the optimizer's math ignores it.
  satisfiesLaws?: string[];
}

// Reduction fractions multiply, so the catalog's deepest reachable cut is
// 1 - Π(1 - fraction). With full electrification carrying the bulk of the
// abatement, funding the whole catalog lands around an 82% cut — enough for a
// typical over-cap building to clear even the 2035 limit, which the old catalog
// (max ~47%) could never do. Capex and savings are typical-building editorial
// assumptions, never quotes; each measure names its basis.
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
    // A code-compliant lighting upgrade is exactly what LL88 requires.
    satisfiesLaws: ["ll88"],
  },
  {
    id: "air_sealing",
    name: "Envelope air sealing and insulation",
    capexUsdPerSqft: 4.0,
    emissionsReductionFraction: 0.1,
    basis: "Urban Green Council retrofit guidance",
  },
  {
    id: "solar_pv",
    name: "Rooftop solar PV",
    capexUsdPerSqft: 5.0,
    emissionsReductionFraction: 0.05,
    basis: "NYSERDA NY-Sun cost data",
  },
  {
    id: "heat_pump_cooling",
    name: "Heat-pump cooling and VRF distribution",
    capexUsdPerSqft: 9.0,
    emissionsReductionFraction: 0.12,
    basis: "NYC Accelerator electrification studies",
  },
  {
    id: "windows",
    name: "High-performance window replacement",
    capexUsdPerSqft: 15.0,
    emissionsReductionFraction: 0.1,
    basis: "Urban Green Council deep retrofit data",
  },
  {
    id: "full_electrification",
    name: "Full electrification (all-electric heating and hot water)",
    capexUsdPerSqft: 24.0,
    emissionsReductionFraction: 0.7,
    basis: "NYC Accelerator deep-electrification case studies on a decarbonizing grid",
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
  // Procedural penalties this plan's measures avoid (each law credited once).
  proceduralCreditUsd: number;
  totalCostUsd: number; // capex + horizon fines - procedural credit
  results: FineResult[];
}

export interface OptimizeOptions {
  // Avoidable procedural penalty per law id (e.g. { ll88: 1500 }). A subset
  // containing any measure whose satisfiesLaws names the law is credited that
  // amount in the objective — once per law, however many measures cover it.
  proceduralPenaltySavingsByLaw?: Record<string, number>;
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
  options: OptimizeOptions = {},
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
    const plan = evaluatePlan(building, chosen, options);

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
  if (best!.proceduralCreditUsd > 0) {
    notes.push(
      "Measure selection credits avoided procedural penalties (a measure that also " +
        "retires a filing obligation counts that penalty as savings, once per law).",
    );
  }
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

// What a fixed capex budget actually buys. The optimizer answers "what is
// cheapest"; an owner often asks the inverse — "I can spend $X, what does that
// get me?" Among every measure subset whose capex fits the budget, this picks
// the one that leaves the lowest fines through 2039, breaking ties toward
// spending less. Doing nothing (capex 0) always fits a non-negative budget, so
// this never returns null.
export function planForBudget(
  building: BuildingInput,
  budgetUsd: number,
  measures: RetrofitMeasure[] = DEFAULT_MEASURES,
  options: OptimizeOptions = {},
): RetrofitPlan {
  if (measures.length > MAX_CATALOG) {
    throw new Error(
      `catalog of ${measures.length} exceeds the ${MAX_CATALOG}-measure enumeration cap`,
    );
  }

  const affordableBudget = Math.max(0, budgetUsd);
  const subsetCount = 2 ** measures.length;
  let best: RetrofitPlan | null = null;

  for (let mask = 0; mask < subsetCount; mask++) {
    const chosen = measures.filter((_, index) => mask & (1 << index));
    const plan = evaluatePlan(building, chosen, options);

    if (plan.capexUsd > affordableBudget) {
      continue;
    }

    const beatsOnFines = !best || plan.horizonFinesUsd < best.horizonFinesUsd;
    const tiesButCheaper =
      best !== null &&
      plan.horizonFinesUsd === best.horizonFinesUsd &&
      plan.capexUsd < best.capexUsd;

    if (beatsOnFines || tiesButCheaper) {
      best = plan;
    }
  }

  return best!;
}

// The full cost of implementing a measure across the whole building.
export function fullCostFor(measure: RetrofitMeasure, grossFloorAreaSqft: number): number {
  return round2(measure.capexUsdPerSqft * grossFloorAreaSqft);
}

export interface FundedMeasure {
  id: string;
  name: string;
  basis: string;
  satisfiesLaws?: string[];
  fullCostUsd: number;
  fundedUsd: number;
  fundedFraction: number; // 0..1, the share of the measure paid for
  emissionsCutTco2e: number; // standalone annual cut from this measure's funded share
}

export interface FundedPlan {
  measures: FundedMeasure[];
  capexUsd: number;
  baselineEmissionsTco2e: number;
  projectedEmissionsTco2e: number;
  horizonFinesUsd: number;
  proceduralCreditUsd: number;
  results: FineResult[];
}

// What a per-measure funding split actually buys. Unlike the optimizer, the
// owner here decides how much to put into each measure; a partially funded
// measure delivers that fraction of its emissions cut (e.g. half the heat-pump
// budget, half its reduction). Reductions still compound multiplicatively, so
// the projected emissions use the product of the funded fractions, while each
// measure also reports the standalone cut its own dollars bought.
export function planFromFunding(
  building: BuildingInput,
  fundingByMeasureId: Record<string, number>,
  measures: RetrofitMeasure[] = DEFAULT_MEASURES,
  options: OptimizeOptions = {},
): FundedPlan {
  const baseline = building.annualEmissionsTco2e;

  const detailed = measures.map(measure => {
    const fullCostUsd = fullCostFor(measure, building.grossFloorAreaSqft);
    const fundedUsd = clamp(fundingByMeasureId[measure.id] ?? 0, 0, fullCostUsd);
    const fundedFraction = fullCostUsd > 0 ? fundedUsd / fullCostUsd : 0;
    const appliedReduction = measure.emissionsReductionFraction * fundedFraction;

    return { measure, fullCostUsd, fundedUsd, fundedFraction, appliedReduction };
  });

  const remainingFraction = detailed.reduce(
    (fraction, line) => fraction * (1 - line.appliedReduction),
    1,
  );
  const projectedEmissionsTco2e = round2(baseline * remainingFraction);
  const capexUsd = round2(detailed.reduce((sum, line) => sum + line.fundedUsd, 0));

  const adjusted = { ...building, annualEmissionsTco2e: projectedEmissionsTco2e };
  const results = (Object.keys(PERIOD_YEARS) as Period[]).map(period =>
    computeFine(adjusted, period),
  );
  const horizonFinesUsd = round2(
    results.reduce((sum, result) => sum + result.annualFineUsd * PERIOD_YEARS[result.period], 0),
  );

  // A filing obligation is only retired once the measure that covers it is
  // fully funded — a half-paid lighting job hasn't satisfied LL88.
  const fullyFunded = detailed
    .filter(line => line.fullCostUsd > 0 && line.fundedUsd >= line.fullCostUsd)
    .map(line => line.measure);

  const measureBreakdown: FundedMeasure[] = detailed.map(line => ({
    id: line.measure.id,
    name: line.measure.name,
    basis: line.measure.basis,
    satisfiesLaws: line.measure.satisfiesLaws,
    fullCostUsd: round2(line.fullCostUsd),
    fundedUsd: round2(line.fundedUsd),
    fundedFraction: line.fundedFraction,
    emissionsCutTco2e: round2(baseline * line.appliedReduction),
  }));

  return {
    measures: measureBreakdown,
    capexUsd,
    baselineEmissionsTco2e: baseline,
    projectedEmissionsTco2e,
    horizonFinesUsd,
    proceduralCreditUsd: proceduralCredit(fullyFunded, options),
    results,
  };
}

function evaluatePlan(
  building: BuildingInput,
  chosen: RetrofitMeasure[],
  options: OptimizeOptions = {},
): RetrofitPlan {
  const { capexUsd, projectedEmissionsTco2e } = applyMeasures(building, chosen);

  const adjusted = { ...building, annualEmissionsTco2e: projectedEmissionsTco2e };
  const results = (Object.keys(PERIOD_YEARS) as Period[]).map(period =>
    computeFine(adjusted, period),
  );

  const horizonFinesUsd = results.reduce(
    (sum, result) => sum + result.annualFineUsd * PERIOD_YEARS[result.period],
    0,
  );

  const proceduralCreditUsd = proceduralCredit(chosen, options);

  return {
    measureIds: chosen.map(measure => measure.id),
    capexUsd,
    projectedEmissionsTco2e,
    horizonFinesUsd: round2(horizonFinesUsd),
    proceduralCreditUsd,
    totalCostUsd: round2(capexUsd + horizonFinesUsd - proceduralCreditUsd),
    results,
  };
}

// Each law is credited once, no matter how many chosen measures satisfy it.
function proceduralCredit(
  chosen: RetrofitMeasure[],
  options: OptimizeOptions,
): number {
  const savings = options.proceduralPenaltySavingsByLaw;
  if (!savings) {
    return 0;
  }

  const lawsRetired = new Set(chosen.flatMap(measure => measure.satisfiesLaws ?? []));
  let credit = 0;
  for (const lawId of lawsRetired) {
    credit += savings[lawId] ?? 0;
  }
  return round2(credit);
}

// The capex and resulting emissions of applying a measure set. Reductions
// compound multiplicatively against current emissions; capex is per-sqft.
function applyMeasures(
  building: BuildingInput,
  chosen: RetrofitMeasure[],
): { capexUsd: number; projectedEmissionsTco2e: number } {
  const capexUsd = chosen.reduce(
    (sum, measure) => sum + measure.capexUsdPerSqft * building.grossFloorAreaSqft,
    0,
  );

  const remainingFraction = chosen.reduce(
    (fraction, measure) => fraction * (1 - measure.emissionsReductionFraction),
    1,
  );

  return {
    capexUsd: round2(capexUsd),
    projectedEmissionsTco2e: round2(building.annualEmissionsTco2e * remainingFraction),
  };
}

export interface Article321Plan {
  measureIds: string[];
  capexUsd: number;
  projectedEmissionsTco2e: number;
}

export interface Article321Assessment {
  // The 2030 standard limit the building must clear to use the performance
  // pathway (Admin Code 28-321.2.1).
  target2030Tco2e: number;
  currentEmissionsTco2e: number;
  alreadyUnderTarget: boolean;
  // Cheapest measure set whose projected emissions clear the 2030 target, or
  // null when even the full catalog can't reach it — then the prescribed
  // measures of 28-321.2.2 are the route. Empty plan when already compliant.
  cheapestCompliantPlan: Article321Plan | null;
  evaluatedSubsets: number;
  notes: string[];
}

// Article 321 buildings face no $268/tCO2e penalty, so the objective flips:
// minimize capex subject to clearing the 2030 target, rather than trade capex
// against fines. A building already under the target needs no measures at all.
export function optimizeArticle321(
  building: BuildingInput,
  measures: RetrofitMeasure[] = DEFAULT_MEASURES,
): Article321Assessment {
  if (measures.length > MAX_CATALOG) {
    throw new Error(
      `catalog of ${measures.length} exceeds the ${MAX_CATALOG}-measure enumeration cap`,
    );
  }

  const standard = computeFine({ ...building, isArticle321: false }, "2030-2034");
  const target = standard.emissionsLimitTco2e;
  const current = building.annualEmissionsTco2e;

  const baseNote =
    "Article 321 complies through the prescribed measures of Admin Code 28-321.2.2 " +
    "or by holding emissions under the 2030 limit (28-321.2.1). Capex figures are " +
    "typical-building assumptions, not quotes.";

  if (current <= target) {
    return {
      target2030Tco2e: target,
      currentEmissionsTco2e: current,
      alreadyUnderTarget: true,
      cheapestCompliantPlan: {
        measureIds: [],
        capexUsd: 0,
        projectedEmissionsTco2e: current,
      },
      evaluatedSubsets: 1,
      notes: [
        baseNote,
        "Current emissions already clear the 2030 target — certify the performance pathway.",
      ],
    };
  }

  const subsetCount = 2 ** measures.length;
  let cheapest: Article321Plan | null = null;

  for (let mask = 0; mask < subsetCount; mask++) {
    const chosen = measures.filter((_, index) => mask & (1 << index));
    const { capexUsd, projectedEmissionsTco2e } = applyMeasures(building, chosen);

    if (projectedEmissionsTco2e > target) {
      continue;
    }
    if (!cheapest || capexUsd < cheapest.capexUsd) {
      cheapest = {
        measureIds: chosen.map(measure => measure.id),
        capexUsd,
        projectedEmissionsTco2e,
      };
    }
  }

  const notes = [baseNote];
  if (!cheapest) {
    notes.push(
      "No measure set in the catalog clears the 2030 target; the prescribed " +
        "measures pathway (28-321.2.2) is the route to compliance.",
    );
  }

  return {
    target2030Tco2e: target,
    currentEmissionsTco2e: current,
    alreadyUnderTarget: false,
    cheapestCompliantPlan: cheapest,
    evaluatedSubsets: subsetCount,
    notes,
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

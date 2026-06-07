// The whole-building compliance plan: one address, one plan covering every law
// at once. It joins the obligation set to the retrofit plan so that a single
// physical measure is credited against every law it retires — the LED lighting
// upgrade closes the LL97 gap and clears LL88 in one line, never two. Each
// obligation gets exactly one disposition, so nothing is recommended or counted
// twice.

import { DEFAULT_MEASURES } from "../../engine/src/retrofit.ts";
import {
  assessObligations,
  type ComplianceStatus,
  type Obligation,
} from "./obligations.ts";
import { planRetrofit, type RetrofitPlan } from "./retrofit.ts";
import type { BuildingFacts } from "./types.ts";

export interface PlanMeasure {
  id: string;
  name: string;
  capexUsd: number;
  // Procedural laws this measure also retires for this building.
  alsoSatisfies: string[];
}

// How the plan disposes of one obligation. Exactly one applies per obligation.
export type Handling =
  | "retrofit_measures" // a chosen physical measure addresses it
  | "filing" // a separate filing or inspection is still needed
  | "already_compliant" // nothing to do
  | "needs_attention"; // a data gap, or the prescribed-measures pathway

export interface ObligationDisposition {
  lawId: string;
  lawName: string;
  kind: "performance" | "procedural";
  status: ComplianceStatus;
  handledBy: Handling;
  detail: string;
}

export interface CompliancePlan {
  address: string;
  bbl: string;
  // null when the engine can't price the building (no emissions or use splits).
  pathway: "standard" | "article321" | null;
  measures: PlanMeasure[];
  totalCapexUsd: number;
  dispositions: ObligationDisposition[];
  // One human line per measure that also retires a procedural law.
  crossCredits: string[];
  notes: string[];
}

export function buildCompliancePlan(
  facts: BuildingFacts,
  options: { asOf?: Date } = {},
): CompliancePlan {
  const asOf = options.asOf ?? new Date();
  const { obligations } = assessObligations(facts, { asOf });
  const plan = planRetrofit(facts);

  const sqft = facts.grossFloorAreaSqft ?? 0;
  const proceduralLawIds = new Set(
    obligations.filter(obligation => obligation.kind === "procedural").map(o => o.lawId),
  );
  const lawNameById = new Map(obligations.map(o => [o.lawId, o.lawName]));

  const measures = chosenMeasures(plan, sqft, proceduralLawIds);

  // Which procedural law each chosen measure retires, so dispositions and
  // cross-credits agree on a single source.
  const retiredByMeasure = new Map<string, PlanMeasure>();
  for (const measure of measures) {
    for (const lawId of measure.alsoSatisfies) {
      retiredByMeasure.set(lawId, measure);
    }
  }

  const dispositions = obligations.map(obligation =>
    disposition(obligation, plan, retiredByMeasure),
  );

  const crossCredits = measures.flatMap(measure =>
    measure.alsoSatisfies.map(
      lawId => `The ${measure.name} also clears ${lawNameById.get(lawId) ?? lawId}.`,
    ),
  );

  return {
    address: facts.address,
    bbl: facts.bbl,
    pathway: plan?.pathway ?? null,
    measures,
    totalCapexUsd: planTotalCapex(plan),
    dispositions,
    crossCredits,
    notes: plan?.findings ?? [],
  };
}

function chosenMeasures(
  plan: RetrofitPlan | null,
  sqft: number,
  proceduralLawIds: Set<string>,
): PlanMeasure[] {
  return chosenMeasureIds(plan).map(id => {
    const definition = DEFAULT_MEASURES.find(measure => measure.id === id);
    return {
      id,
      name: definition?.name ?? id,
      capexUsd: round2((definition?.capexUsdPerSqft ?? 0) * sqft),
      alsoSatisfies: (definition?.satisfiesLaws ?? []).filter(lawId =>
        proceduralLawIds.has(lawId),
      ),
    };
  });
}

function disposition(
  obligation: Obligation,
  plan: RetrofitPlan | null,
  retiredByMeasure: Map<string, PlanMeasure>,
): ObligationDisposition {
  const base = {
    lawId: obligation.lawId,
    lawName: obligation.lawName,
    kind: obligation.kind,
    status: obligation.status,
  };

  if (obligation.kind === "performance") {
    if (obligation.status === "unknown") {
      return {
        ...base,
        handledBy: "needs_attention",
        detail: "Emissions baseline is missing — file LL84 so the gap can be computed.",
      };
    }
    if (obligation.status === "satisfied") {
      return {
        ...base,
        handledBy: "already_compliant",
        detail: "Emissions are under the cap.",
      };
    }
    if (
      plan?.pathway === "article321" &&
      plan.assessment.cheapestCompliantPlan === null
    ) {
      return {
        ...base,
        handledBy: "needs_attention",
        detail:
          "No measure set clears the 2030 target; comply through the prescribed-measures pathway.",
      };
    }
    return {
      ...base,
      handledBy: "retrofit_measures",
      detail: "The retrofit plan's cheapest measure set closes the emissions gap.",
    };
  }

  const retiringMeasure = retiredByMeasure.get(obligation.lawId);
  if (retiringMeasure) {
    return {
      ...base,
      handledBy: "retrofit_measures",
      detail: `Addressed by the ${retiringMeasure.name} in the retrofit plan — no separate upgrade needed.`,
    };
  }
  if (obligation.status === "satisfied") {
    return { ...base, handledBy: "already_compliant", detail: "Filing is on record." };
  }
  return {
    ...base,
    handledBy: "filing",
    detail: obligation.recommendations[0] ?? "File before the deadline.",
  };
}

function chosenMeasureIds(plan: RetrofitPlan | null): string[] {
  if (!plan) {
    return [];
  }
  if (plan.pathway === "standard") {
    return plan.assessment.best.measureIds;
  }
  return plan.assessment.cheapestCompliantPlan?.measureIds ?? [];
}

function planTotalCapex(plan: RetrofitPlan | null): number {
  if (!plan) {
    return 0;
  }
  if (plan.pathway === "standard") {
    return plan.assessment.best.capexUsd;
  }
  return plan.assessment.cheapestCompliantPlan?.capexUsd ?? 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

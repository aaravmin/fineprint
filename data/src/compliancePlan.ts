// The whole-building compliance plan: one address, one plan covering every law
// at once. It joins the obligation set to the retrofit plan so that a single
// physical measure is credited against every law it retires — the LED lighting
// upgrade closes the LL97 gap and clears LL88 in one line, never two. Each
// obligation gets exactly one disposition, so nothing is recommended or counted
// twice.

import { DEFAULT_MEASURES } from "../../engine/src/retrofit.ts";
<<<<<<< HEAD
import type { Obligation as ObligationType } from "./obligations.ts";
=======
import { toEngineInput } from "./engineBridge.ts";
>>>>>>> refs/remotes/origin/main
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

// Why a building has (or lacks) LL97 fine figures. The point is to reason about
// the cause before drawing a conclusion — "no data" is never reported as bare
// "not applicable", because the same empty result has very different meanings.
export type FineDataStatus =
  | "available" // fines were computed; nothing to explain
  | "not_applicable" // absent from DOB's covered list -> LL97 most likely doesn't apply
  | "covered_unfiled" // LL97 applies, but no LL84 filing exists to compute from
  | "data_incomplete" // a filing exists but is missing/unpriceable fields
  | "error"; // the lookup itself failed (bad address, dataset unreachable)

export interface FineDataExplanation {
  status: FineDataStatus;
  // Cause-first, plain-language reasoning. Empty when status is "available".
  message: string;
  // The BuildingFacts fields the engine needed but couldn't get, for detail.
  missing: string[];
}

// One law, separated out: the fine it carries and how the plan handles it. This
// is the per-law view a frontend renders as distinct cards.
export interface LawSummary {
  lawId: string;
  lawName: string;
  kind: "performance" | "procedural";
  status: ComplianceStatus;
  // The money this law puts at risk: the current-period annual LL97 fine for the
  // performance law, or the civil penalty for a procedural one. Null when not
  // quantified (missing data, or Article 321's flat penalties).
  exposureUsd: number | null;
  handledBy: Handling;
  // Ids of the prioritized actions that resolve this law (measure ids and/or the
  // law's own filing id). Empty when nothing addresses it yet.
  addressedByActionIds: string[];
  detail: string;
}

// One law an action resolves, with that law's exposure — the structured form of
// the overlap, so the frontend can draw an action linked to several laws rather
// than print "this also covers …" sentences.
export interface ActionLawLink {
  lawId: string;
  lawName: string;
  exposureUsd: number | null;
}

// One thing to do — a retrofit measure or a filing — and every law it resolves.
// An action that resolves more than one law is the high-value overlap: one fix,
// several fines. The frontend ranks by priorityScore and can badge isOverlap.
export interface PrioritizedAction {
  kind: "measure" | "filing";
  id: string;
  name: string;
  capexUsd: number | null;
  satisfies: ActionLawLink[];
  // True when this single action resolves more than one law.
  isOverlap: boolean;
  // Total exposure across the laws this action helps resolve. For a measure the
  // performance fine is shared across the whole measure set, not attributable to
  // this one measure alone — read it as "exposure this action contributes to".
  exposureAddressedUsd: number;
  // Ranking weight. Driven by exposure, then boosted for overlap so a fix that
  // clears two fines outranks an equal-exposure fix that clears one. Higher
  // means do it first.
  priorityScore: number;
}

export interface CompliancePlan {
  address: string;
  bbl: string;
  // null when the engine can't price the building (no emissions or use splits).
  pathway: "standard" | "article321" | null;
  measures: PlanMeasure[];
  totalCapexUsd: number;
  dispositions: ObligationDisposition[];
  // Per-law breakdown: each law's fine and how the plan handles it.
  laws: LawSummary[];
  // Every action to take, ranked so overlaps (one fix, several fines) come first.
  actions: PrioritizedAction[];
  // One human line per measure that also retires a procedural law. Superseded by
  // `actions` for structured rendering; kept for plain-text narration.
  crossCredits: string[];
  // Why fines are or aren't shown, reasoned from the data. See explainFineData.
  fineData: FineDataExplanation;
  notes: string[];
}

export function buildCompliancePlan(
  facts: BuildingFacts,
  options: { asOf?: Date } = {},
): CompliancePlan {
  const asOf = options.asOf ?? new Date();
  const { obligations } = assessObligations(facts, { asOf });
  const plan = planRetrofit(facts, {
    proceduralPenaltySavingsByLaw: proceduralPenaltySavings(obligations),
  });

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

  const actions = buildActions(obligations, measures, dispositions);
  const laws = buildLawSummaries(obligations, dispositions, actions);

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
    laws,
    actions,
    crossCredits,
    fineData: explainFineData(facts),
    notes: plan?.findings ?? [],
  };
}

// Each extra law an action retires adds 50% to its ranking weight, so a fix that
// clears two fines outranks an equal-exposure fix that clears one.
const OVERLAP_WEIGHT = 0.5;

// The money a law puts at risk: the current-period annual fine for the
// performance law, the civil penalty for a procedural one. Null when the data
// can't quantify it (missing baseline, or Article 321's flat penalties).
function obligationExposureUsd(obligation: Obligation): number | null {
  if (obligation.kind === "procedural") {
    return obligation.penaltyUsd;
  }
  const current = obligation.periods.find(period => period.period === "2024-2029");
  return current ? Math.round(current.annualFineUsd) : null;
}

// Turn the obligations and chosen measures into a single ranked to-do list.
// Every measure contributes to the performance law; some also retire a
// procedural law (the overlap). A procedural law no measure covers becomes its
// own single-law filing action.
function buildActions(
  obligations: Obligation[],
  measures: PlanMeasure[],
  dispositions: ObligationDisposition[],
): PrioritizedAction[] {
  const exposureByLawId = new Map(
    obligations.map(obligation => [obligation.lawId, obligationExposureUsd(obligation)]),
  );
  const nameByLawId = new Map(obligations.map(o => [o.lawId, o.lawName]));
  const performance = obligations.find(obligation => obligation.kind === "performance");

  const linkFor = (lawId: string): ActionLawLink => ({
    lawId,
    lawName: nameByLawId.get(lawId) ?? lawId,
    exposureUsd: exposureByLawId.get(lawId) ?? null,
  });

  const actions: PrioritizedAction[] = [];

  for (const measure of measures) {
    const satisfies: ActionLawLink[] = [];
    if (performance) {
      satisfies.push(linkFor(performance.lawId));
    }
    for (const lawId of measure.alsoSatisfies) {
      satisfies.push(linkFor(lawId));
    }
    actions.push(
      makeAction("measure", measure.id, measure.name, measure.capexUsd, satisfies),
    );
  }

  for (const disposition of dispositions) {
    if (disposition.kind !== "procedural" || disposition.handledBy !== "filing") {
      continue;
    }
    actions.push(
      makeAction("filing", disposition.lawId, disposition.lawName, null, [
        linkFor(disposition.lawId),
      ]),
    );
  }

  return actions.sort((a, b) => b.priorityScore - a.priorityScore);
}

function makeAction(
  kind: "measure" | "filing",
  id: string,
  name: string,
  capexUsd: number | null,
  satisfies: ActionLawLink[],
): PrioritizedAction {
  const exposureAddressedUsd = satisfies.reduce(
    (sum, link) => sum + (link.exposureUsd ?? 0),
    0,
  );
  const extraLaws = Math.max(0, satisfies.length - 1);

  return {
    kind,
    id,
    name,
    capexUsd,
    satisfies,
    isOverlap: satisfies.length > 1,
    exposureAddressedUsd,
    priorityScore: Math.round(exposureAddressedUsd * (1 + extraLaws * OVERLAP_WEIGHT)),
  };
}

// The per-law view: fold each obligation's disposition and exposure together,
// and record which actions resolve it (the inverse of action.satisfies).
function buildLawSummaries(
  obligations: Obligation[],
  dispositions: ObligationDisposition[],
  actions: PrioritizedAction[],
): LawSummary[] {
  const dispositionByLawId = new Map(dispositions.map(d => [d.lawId, d]));

  return obligations.map(obligation => {
    const handling = dispositionByLawId.get(obligation.lawId);
    const addressedByActionIds = actions
      .filter(action => action.satisfies.some(link => link.lawId === obligation.lawId))
      .map(action => action.id);

    return {
      lawId: obligation.lawId,
      lawName: obligation.lawName,
      kind: obligation.kind,
      status: obligation.status,
      exposureUsd: obligationExposureUsd(obligation),
      handledBy: handling?.handledBy ?? "needs_attention",
      addressedByActionIds,
      detail: handling?.detail ?? "",
    };
  });
}

// Reason about why a building has no LL97 fine figures, cause first. A building
// can geocode cleanly (it is a real NYC lot) and still show no dollars, and the
// reason matters: it changes whether the owner should relax or act. We never
// collapse this to a bare "not applicable" — the same empty result splits into:
//
//   not_applicable  — absent from DOB's Covered Buildings List. DOB lists every
//                     covered building, so absence usually means LL97 genuinely
//                     does not apply (typically under the 25,000 sqft threshold:
//                     a small office, shop, or storefront). Caveat: the list is
//                     annual, so a genuinely large building could be missing —
//                     we say to verify size rather than assume exemption.
//   covered_unfiled — on the list, but no LL84 filing exists. LL97 DOES apply;
//                     the data is missing because the building wasn't benchmarked.
//                     That is a compliance gap, not an exemption.
//   data_incomplete — a filing exists but a needed field is missing/unpriceable
//                     (e.g. a fuel with no verified coefficient). A data-quality
//                     problem to review, not an exemption.
//
// The error case (bad address, dataset unreachable) is reported by
// explainLookupError at the lookup boundary, before facts ever exist.
//
// FRONTEND TODO (not yet wired into the UI — pick this up when the building view
// is built): render CompliancePlan.fineData.message in place of the fines
// section whenever fineData.status !== "available", styled by status (error and
// covered_unfiled warrant a stronger banner than not_applicable). At the address
// lookup call site, wrap lookupBuilding in try/catch and use explainLookupError
// to produce the "error" status. Other obligations should still render normally.
export function explainFineData(facts: BuildingFacts): FineDataExplanation {
  const { input, missing } = toEngineInput(facts);
  if (input) {
    return { status: "available", message: "", missing: [] };
  }

  const covered = facts.isLl97Covered === true;
  const hasFiling = facts.infrastructureProfile?.hasLl84Filing ?? false;

  if (covered && hasFiling) {
    return {
      status: "data_incomplete",
      missing,
      message:
        "LL97 covers this building and an LL84 filing is on record, but the filing is " +
        `missing the data needed to price fines (${missing.join(", ")}). That points to ` +
        "an incomplete or unmappable benchmarking submission — review the LL84 filing " +
        "rather than treat it as an exemption.",
    };
  }

  if (covered) {
    return {
      status: "covered_unfiled",
      missing,
      message:
        "LL97 applies to this building — it is on DOB's Covered Buildings List — but no " +
        "LL84 benchmarking filing is on record, so fines can't be computed. The data is " +
        "missing because the building hasn't been benchmarked, which is itself a " +
        "compliance gap, not an exemption. File LL84 to establish the baseline.",
    };
  }

  return {
    status: "not_applicable",
    missing,
    message:
      "This building is not on DOB's Covered Buildings List. DOB lists every LL97-covered " +
      "building, so absence usually means LL97 does not apply — typically a building under " +
      "the 25,000 sq ft threshold, such as a small office, shop, or storefront. If you " +
      "believe this building is over 25,000 sq ft it may be missing from DOB's annual " +
      "list; verify the size before assuming it is exempt.",
  };
}

// Map a thrown lookup error to the "error" explanation. Use this where
// lookupBuilding is invoked, so a failed address shows a real reason instead of
// being mistaken for a building that simply has no fine data.
export function explainLookupError(error: unknown): FineDataExplanation {
  const detail = error instanceof Error ? error.message : String(error);

  if (/no NYC address found/i.test(detail)) {
    return {
      status: "error",
      missing: [],
      message:
        "We couldn't match that to a NYC building. Check the spelling and include the " +
        'borough (for example "350 5th Avenue, Manhattan").',
    };
  }

  if (/no BBL|taxable lot/i.test(detail)) {
    return {
      status: "error",
      missing: [],
      message:
        "That address matched a place in NYC but not a taxable building lot, so there is " +
        "nothing to assess. Confirm it is a building address.",
    };
  }

  return {
    status: "error",
    missing: [],
    message:
      "A city data source couldn't be reached while looking up this building. This is a " +
      `temporary error — please try again. (${detail})`,
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

// Avoidable penalty per procedural law a measure could retire: only laws that
// are actually owed (due or at risk) and carry an honest dollar figure count.
// Exported so the assess_building tool credits the same way the plan does.
export function proceduralPenaltySavings(
  obligations: ObligationType[],
): Record<string, number> {
  const measureSatisfiable = new Set(
    DEFAULT_MEASURES.flatMap(measure => measure.satisfiesLaws ?? []),
  );

  const savings: Record<string, number> = {};
  for (const obligation of obligations) {
    if (obligation.kind !== "procedural") continue;
    if (obligation.status !== "due" && obligation.status !== "at_risk") continue;
    if (obligation.penaltyUsd === null || obligation.penaltyUsd <= 0) continue;
    if (!measureSatisfiable.has(obligation.lawId)) continue;
    savings[obligation.lawId] = obligation.penaltyUsd;
  }
  return savings;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Building-aware retrofit planning. The engine's optimizeRetrofit is pure: it
// minimizes total cost over whatever measure catalog it is handed, with a fixed
// reduction fraction per measure. This layer feeds it the building's own
// personalized measures - each carrying a condition- and fuel-aware emissions
// cut and a real cost - instead of the generic defaults, and drops the ones the
// public record shows are already done or don't apply. The optimizer still does
// the subset math; it just does it over this building's real options.

import {
  optimizeArticle321,
  optimizeRetrofit,
  type Article321Assessment,
  type OptimizeOptions,
  type RetrofitAssessment,
  type RetrofitMeasure,
} from "../../engine/src/retrofit.ts";
import { toEngineInput } from "./engineBridge.ts";
import { measureSatisfiesLaws, type PersonalizedMeasure } from "./personalizedMeasures.ts";
import type { BuildingFacts, InfrastructureProfile } from "./types.ts";

// The engine enumerates every subset of the measures it is handed, so the count
// it accepts is capped. Restated here so the ranked truncation below names the
// same limit the engine enforces.
const MAX_ENGINE_MEASURES = 12;

export interface MeasureExclusion {
  id: string;
  name: string;
  reason: string;
}

// Two pathways, two optimizers. Standard buildings trade capex against
// $268/tCO2e fines; Article 321 buildings minimize capex to clear the 2030
// target. Both share the same personalized measure set, exclusions, and
// findings. `measures` carries the full personalized catalog - recommendations
// and set-aside options alike - so the compliance plan can tell the whole story.
export type RetrofitPlan =
  | {
      pathway: "standard";
      assessment: RetrofitAssessment;
      measures: PersonalizedMeasure[];
      excluded: MeasureExclusion[];
      findings: string[];
    }
  | {
      pathway: "article321";
      assessment: Article321Assessment;
      measures: PersonalizedMeasure[];
      excluded: MeasureExclusion[];
      findings: string[];
    };

// One address's retrofit plan, or null when the engine can't price the building
// (no emissions or use splits - the same gate as the fine projections). The
// personalized measures come in already computed (the compliance plan builds
// them once and reuses them for the persisted personalization block), so this
// layer only turns the applicable ones into the engine's measure vocabulary.
// options.proceduralPenaltySavingsByLaw credits avoided procedural penalties in
// measure selection, computed from the obligation set upstream.
export function planRetrofit(
  facts: BuildingFacts,
  personalizedMeasures: PersonalizedMeasure[],
  options: OptimizeOptions = {},
): RetrofitPlan | null {
  const { input } = toEngineInput(facts);
  if (!input) {
    return null;
  }

  const sqft = facts.grossFloorAreaSqft ?? 0;
  const engineMeasures = toEngineMeasures(personalizedMeasures, sqft);
  const excluded = excludedMeasures(personalizedMeasures);
  const findings = retrofitFindings(facts.infrastructureProfile ?? null);

  if (input.isArticle321) {
    return {
      pathway: "article321",
      assessment: optimizeArticle321(input, engineMeasures),
      measures: personalizedMeasures,
      excluded,
      findings,
    };
  }

  return {
    pathway: "standard",
    assessment: optimizeRetrofit(input, engineMeasures, options),
    measures: personalizedMeasures,
    excluded,
    findings,
  };
}

// The applicable personalized measures, in the engine's vocabulary: capex
// spread over the floor area, the building-specific reduction as the engine's
// multiplicative fraction, and the why sentence as the basis. Only recommended
// and applicable measures with a real reduction to offer make the cut; the rest
// (already done, not applicable, or nothing to reduce) never reach the optimizer.
// Ranked by reduction and truncated to the engine's enumeration cap, though the
// twelve-entry catalog only reaches it when every steam option is live.
function toEngineMeasures(
  personalizedMeasures: PersonalizedMeasure[],
  sqft: number,
): RetrofitMeasure[] {
  const usable = personalizedMeasures.filter(
    measure =>
      (measure.applicability === "recommended" || measure.applicability === "applicable") &&
      measure.effectiveReductionFraction !== null &&
      measure.effectiveReductionFraction > 0 &&
      measure.capexUsd !== null,
  );

  const ranked = [...usable].sort(
    (a, b) => (b.estReductionTco2e ?? 0) - (a.estReductionTco2e ?? 0),
  );
  const withinCap = ranked.slice(0, MAX_ENGINE_MEASURES);

  return withinCap.map(measure => ({
    id: measure.id,
    name: measure.name,
    // Right-sizing carries a negative incremental capex; an absolute-capex
    // optimizer must never be paid to add a measure, so floor it at zero here.
    // The personalized measure still reports its true cost for the plan.
    capexUsdPerSqft: sqft > 0 ? Math.max(0, measure.capexUsd ?? 0) / sqft : 0,
    emissionsReductionFraction: measure.effectiveReductionFraction ?? 0,
    basis: measure.why,
    satisfiesLaws: satisfiesLawsFor(measure.id),
    // Carry the category + exclusivity so the optimizer groups and de-conflicts
    // competing alternatives (e.g. heat pump vs new boiler) the same way the
    // client sliders do.
    category: measure.category,
    targetSystem: measure.targetSystem,
    exclusiveGroup: measure.exclusiveGroup,
    reducesEmissions: measure.reducesEmissions,
  }));
}

// Measures the record set aside: already done or not applicable. These are the
// old tailorMeasures exclusions (existing solar, an all-electric building) plus
// everything else the applicability logic ruled out, each with its evidence-cited
// reason - so the plan can say what it considered and why it passed.
function excludedMeasures(personalizedMeasures: PersonalizedMeasure[]): MeasureExclusion[] {
  return personalizedMeasures
    .filter(
      measure =>
        measure.applicability === "already_done" || measure.applicability === "not_applicable",
    )
    .map(measure => ({
      id: measure.id,
      name: measure.name,
      reason: measure.applicabilityReason,
    }));
}

function satisfiesLawsFor(measureId: string): string[] | undefined {
  const laws = measureSatisfiesLaws(measureId);
  return laws.length > 0 ? laws : undefined;
}

// Findings narrate the equipment behind the plan - heating fuel, boilers, recent
// work, efficiency tier - from the infrastructure profile. The systems dossier
// now carries a far richer picture, but these plain lines still feed the AI
// advisor and the plan's notes, so they stay honest about what the record shows.
function retrofitFindings(profile: InfrastructureProfile | null): string[] {
  if (!profile) {
    return [];
  }

  const findings: string[] = [];

  if (profile.heatingFuel) {
    const fuels =
      profile.fuelTypes.length > 0
        ? ` (${profile.fuelTypes.map(humanizeFuel).join(", ")})`
        : "";
    findings.push(`Primary heating fuel is ${humanizeFuel(profile.heatingFuel)}${fuels}.`);
  }

  if (profile.boilerCount > 0) {
    const condition =
      profile.boilerCondition === "defects_on_record"
        ? " with defects on record (DOB boiler inspections)"
        : "";
    findings.push(
      `${profile.boilerCount} boiler(s) on record${condition}.` +
        (profile.boilerCondition === "defects_on_record"
          ? " Failing combustion plant is the moment to weigh full electrification, which both retires the repair and is the deepest emissions cut."
          : ""),
    );
  }

  if (profile.recentHvacWork) {
    findings.push(
      "A recent mechanical or boiler filing is on record - confirm the plant upgrade isn't already underway before budgeting it.",
    );
  }

  if (profile.efficiencyTier === "high") {
    findings.push(
      "ENERGY STAR score is in the high tier (75+), so controls and lighting likely have limited headroom left.",
    );
  } else if (profile.efficiencyTier === "low") {
    findings.push(
      "ENERGY STAR score is in the low tier (under 50) - controls, lighting, and envelope measures still have real headroom.",
    );
  }

  return findings;
}

function humanizeFuel(fuel: string): string {
  return fuel.replace(/_/g, " ");
}

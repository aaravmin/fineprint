// Building-aware retrofit planning. The engine's optimizeRetrofit is pure: it
// minimizes total cost over whatever measure catalog it is handed. This layer
// decides which measures actually make sense for one real building — dropping
// the ones its public record shows are already done, and citing the equipment
// evidence so a recommendation can name what it relied on. Capex and savings
// remain editorial assumptions; the tailoring only changes which measures are
// on the table, never their figures.

import {
  DEFAULT_MEASURES,
  optimizeRetrofit,
  type RetrofitAssessment,
  type RetrofitMeasure,
} from "../../engine/src/retrofit.ts";
import { toEngineInput } from "./engineBridge.ts";
import type { BuildingFacts, InfrastructureProfile } from "./types.ts";

export interface MeasureExclusion {
  id: string;
  name: string;
  reason: string;
}

export interface RetrofitPlan {
  // The optimizer's result over the measures that survived tailoring.
  assessment: RetrofitAssessment;
  // Measures removed before optimizing, each with the evidence that removed it.
  excluded: MeasureExclusion[];
  // Building-specific observations, phrased so narration can quote them.
  findings: string[];
}

// One address's retrofit plan, or null when the engine can't price the building
// (no emissions or use splits — same gate as the fine projections).
export function planRetrofit(facts: BuildingFacts): RetrofitPlan | null {
  const { input } = toEngineInput(facts);
  if (!input) {
    return null;
  }

  const profile = facts.infrastructureProfile ?? null;
  const { measures, excluded } = tailorMeasures(profile);

  return {
    assessment: optimizeRetrofit(input, measures),
    excluded,
    findings: retrofitFindings(profile),
  };
}

// Drop measures the building's record shows are already in place. Exclusions
// turn only on hard evidence (a solar permit, an all-electric fuel profile);
// softer signals (efficiency tier, recent work) become findings, not removals,
// so the optimizer is never starved of an option on a guess.
function tailorMeasures(profile: InfrastructureProfile | null): {
  measures: RetrofitMeasure[];
  excluded: MeasureExclusion[];
} {
  if (!profile) {
    return { measures: DEFAULT_MEASURES, excluded: [] };
  }

  const excluded: MeasureExclusion[] = [];
  const isAllElectric = profile.heatingFuel === "electricity";

  const measures = DEFAULT_MEASURES.filter(measure => {
    if (measure.id === "solar_pv" && profile.hasPV) {
      excluded.push({
        id: measure.id,
        name: measure.name,
        reason: "rooftop solar is already on record (DOB solar permit evidence)",
      });
      return false;
    }

    if (measure.id === "heating_plant" && isAllElectric) {
      excluded.push({
        id: measure.id,
        name: measure.name,
        reason: "building is all-electric — no combustion plant to upgrade",
      });
      return false;
    }

    if (measure.id === "heat_pumps" && isAllElectric) {
      excluded.push({
        id: measure.id,
        name: measure.name,
        reason: "building is already all-electric — partial electrification adds little",
      });
      return false;
    }

    return true;
  });

  return { measures, excluded };
}

function retrofitFindings(profile: InfrastructureProfile | null): string[] {
  if (!profile) {
    return [];
  }

  const findings: string[] = [];

  if (profile.heatingFuel) {
    const fuels = profile.fuelTypes.length > 0 ? ` (${profile.fuelTypes.map(humanizeFuel).join(", ")})` : "";
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
          ? " A heating-plant burner and distribution upgrade is both a repair and the cheapest combustion-emissions cut."
          : ""),
    );
  }

  if (profile.recentHvacWork) {
    findings.push(
      "A recent mechanical or boiler filing is on record — confirm the plant upgrade isn't already underway before budgeting it.",
    );
  }

  if (profile.efficiencyTier === "high") {
    findings.push(
      "ENERGY STAR score is in the high tier (75+), so controls and lighting likely have limited headroom left.",
    );
  } else if (profile.efficiencyTier === "low") {
    findings.push(
      "ENERGY STAR score is in the low tier (under 50) — controls, lighting, and envelope measures still have real headroom.",
    );
  }

  return findings;
}

function humanizeFuel(fuel: string): string {
  return fuel.replace(/_/g, " ");
}

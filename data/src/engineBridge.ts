// The single conversion point between this layer's BuildingFacts and the
// engine's BuildingInput. Tools, the ingest script, and the dashboard all
// cross here — nobody assembles an engine input by hand.

import type { BuildingInput } from "../../engine/src/index.ts";
import {
  ESPM_FACTORS_TCO2E_PER_SQFT,
  OCCUPANCY_GROUP_LIMITS_TCO2E_PER_SQFT,
} from "../../engine/src/constants.ts";
import type { BuildingFacts } from "./types.ts";

// Every occupancy name the engine can price: the statutory occupancy-group
// letters and the ESPM property types. A name outside this set makes computeFine
// throw, so the bridge catches it here and degrades instead of crashing.
const ENGINE_PRICEABLE_GROUPS = new Set([
  ...Object.keys(OCCUPANCY_GROUP_LIMITS_TCO2E_PER_SQFT),
  ...Object.keys(ESPM_FACTORS_TCO2E_PER_SQFT),
]);

export interface EngineInputResult {
  input: BuildingInput | null;
  // BuildingFacts fields the engine needs but the city couldn't supply, or
  // supplied unpriceably, in interface order. Non-empty means input is null.
  missing: string[];
}

export function toEngineInput(facts: BuildingFacts): EngineInputResult {
  const missing: string[] = [];

  if (facts.grossFloorAreaSqft === null) {
    missing.push("grossFloorAreaSqft");
  }
  if (facts.occupancyGroups.length === 0) {
    missing.push("occupancyGroups");
  }
  if (facts.annualEmissionsTco2e === null) {
    missing.push("annualEmissionsTco2e");
  }

  // A use the engine's factor tables don't list would throw inside computeFine
  // and crash the assessment. Name it so every consumer degrades to a clear
  // "data incomplete" reason instead of the pipeline blowing up.
  const unpriceableUses = facts.occupancyGroups
    .map(space => space.group)
    .filter(group => !ENGINE_PRICEABLE_GROUPS.has(group));
  if (unpriceableUses.length > 0) {
    missing.push(
      `occupancyGroups with no emissions factor (${unpriceableUses.join(", ")})`,
    );
  }

  if (missing.length > 0) {
    return { input: null, missing };
  }

  // Self-reported use areas can total more than the calculated gross floor area,
  // which the engine rejects. The emissions limit is computed from the per-use
  // areas, not the GFA, so lift the GFA to the summed area rather than fail — no
  // computed figure changes.
  const summedUseSqft = facts.occupancyGroups.reduce((sum, space) => sum + space.sqft, 0);
  const grossFloorAreaSqft = Math.max(facts.grossFloorAreaSqft!, summedUseSqft);

  return {
    input: {
      grossFloorAreaSqft,
      occupancyGroups: facts.occupancyGroups,
      annualEmissionsTco2e: facts.annualEmissionsTco2e!,
      isArticle321: facts.isArticle321 ?? false,
    },
    missing: [],
  };
}

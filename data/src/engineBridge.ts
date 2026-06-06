// The single conversion point between this layer's BuildingFacts and the
// engine's BuildingInput. Tools, the ingest script, and the dashboard all
// cross here — nobody assembles an engine input by hand.

import type { BuildingInput } from "../../engine/src/index.ts";
import type { BuildingFacts } from "./types.ts";

export interface EngineInputResult {
  input: BuildingInput | null;
  // BuildingFacts fields the engine needs but the city couldn't supply,
  // in interface order. Non-empty means input is null.
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

  if (missing.length > 0) {
    return { input: null, missing };
  }

  return {
    input: {
      grossFloorAreaSqft: facts.grossFloorAreaSqft!,
      occupancyGroups: facts.occupancyGroups,
      annualEmissionsTco2e: facts.annualEmissionsTco2e!,
      isArticle321: facts.isArticle321 ?? false,
    },
    missing: [],
  };
}

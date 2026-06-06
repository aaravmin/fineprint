// The orchestrator: one address in, everything Fineprint knows out.
// Chains GeoSearch -> LL84 -> covered list -> HPD, assembles BuildingFacts
// with provenance per field, and degrades honestly when a dataset is silent.

import type { BuildingFacts } from "./types.ts";

export async function lookupBuilding(address: string): Promise<BuildingFacts> {
  throw new Error("lookupBuilding is not implemented yet");
}

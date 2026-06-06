// BBL -> LL97 applicability via DOB's annually published covered buildings
// list. Authoritative — replaces the sqft >= 25,000 heuristic.

import type { Bbl } from "./types.ts";

export async function isLl97Covered(bbl: Bbl): Promise<boolean | null> {
  throw new Error("isLl97Covered is not implemented yet");
}

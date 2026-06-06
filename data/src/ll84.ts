// BBL -> building facts via the LL84 benchmarking disclosure dataset
// (Socrata 5zyy-y8am on data.cityofnewyork.us): gross floor area, property
// types, energy use, reported emissions. Returns null when the building has
// no filing — plenty don't, and the orchestrator must degrade honestly.

import type { Bbl, Ll84Facts } from "./types.ts";

export async function fetchLl84(bbl: Bbl): Promise<Ll84Facts | null> {
  throw new Error("fetchLl84 is not implemented yet");
}

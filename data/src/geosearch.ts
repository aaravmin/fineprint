// Address -> BBL via NYC GeoSearch (Pelias). Free, no key.
// https://geosearch.planninglabs.nyc/v2/search?text=<address>

import type { BblResult } from "./types.ts";

export async function lookupBbl(address: string): Promise<BblResult> {
  throw new Error("lookupBbl is not implemented yet");
}

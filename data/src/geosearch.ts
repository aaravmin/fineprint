// Address -> BBL via NYC GeoSearch (Pelias). Free, no key.
// https://geosearch.planninglabs.nyc/v2/search?text=<address>
//
// GeoSearch ranks candidates; we take the top feature. The BBL lives at
// properties.addendum.pad.bbl. Same street names exist in several boroughs
// (350 5th Ave is both Midtown and Park Slope), so callers should include
// the borough in the query text.

import { fetchJson } from "./http.ts";
import type { BblResult } from "./types.ts";

const GEOSEARCH_URL = "https://geosearch.planninglabs.nyc/v2/search";

interface GeoSearchResponse {
  features: Array<{
    properties: {
      label?: string;
      borough?: string;
      addendum?: { pad?: { bbl?: string } };
    };
  }>;
}

export async function lookupBbl(address: string): Promise<BblResult> {
  const url = `${GEOSEARCH_URL}?text=${encodeURIComponent(address)}`;
  const response = await fetchJson<GeoSearchResponse>(url, { service: "GeoSearch" });

  return parseBblResponse(response, address);
}

// All ranked candidates, for callers that can cross-check against another
// dataset — GeoSearch's top pick is sometimes a different tax lot than the
// one DOF files under (see "1 Pike Street").
export async function lookupBblCandidates(address: string): Promise<BblResult[]> {
  const url = `${GEOSEARCH_URL}?text=${encodeURIComponent(address)}`;
  const response = await fetchJson<GeoSearchResponse>(url, { service: "GeoSearch" });

  return parseBblCandidates(response, address);
}

export function parseBblCandidates(
  response: GeoSearchResponse,
  queriedAddress: string,
): BblResult[] {
  const candidates: BblResult[] = [];
  const seenBbls = new Set<string>();

  for (const feature of response.features) {
    const bbl = feature.properties.addendum?.pad?.bbl;
    if (!bbl || seenBbls.has(bbl)) {
      continue;
    }

    seenBbls.add(bbl);
    candidates.push({
      bbl,
      normalizedAddress: feature.properties.label ?? queriedAddress,
      borough: feature.properties.borough ?? "unknown",
    });
  }

  if (candidates.length === 0) {
    throw new Error(`no NYC address found for "${queriedAddress}"`);
  }

  return candidates;
}

export function parseBblResponse(
  response: GeoSearchResponse,
  queriedAddress: string,
): BblResult {
  const topMatch = response.features[0];
  if (!topMatch) {
    throw new Error(`no NYC address found for "${queriedAddress}"`);
  }

  const bbl = topMatch.properties.addendum?.pad?.bbl;
  if (!bbl) {
    throw new Error(
      `GeoSearch matched "${queriedAddress}" but returned no BBL — not a taxable lot?`,
    );
  }

  return {
    bbl,
    normalizedAddress: topMatch.properties.label ?? queriedAddress,
    borough: topMatch.properties.borough ?? "unknown",
  };
}

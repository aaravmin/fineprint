// Address -> BBL via NYC GeoSearch (Pelias). Free, no key.
// https://geosearch.planninglabs.nyc/v2/search?text=<address>
//
// GeoSearch ranks candidates; we take the top feature. The BBL lives at
// properties.addendum.pad.bbl. Same street names exist in several boroughs
// (350 5th Ave is both Midtown and Park Slope), so callers should include
// the borough in the query text.

import { cachedFetchJson, type StaleSnapshot } from "./http.ts";
import type { BblResult } from "./types.ts";

const GEOSEARCH_URL = "https://geosearch.planninglabs.nyc/v2/search";

interface GeoSearchResponse {
  features: Array<{
    properties: {
      label?: string;
      borough?: string;
      confidence?: number;
      match_type?: string;
      addendum?: { pad?: { bbl?: string; bin?: string } };
    };
  }>;
}

export class GeocodeRejectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodeRejectionError";
  }
}

// The Atlantis guard: Pelias happily "matches" garbage by falling back to a
// nearby lot with the same house number ("999 Nowhere Street, Atlantis"
// once became a real covered Brooklyn building this way). Its confidence
// and match_type fields are useless — NYC GeoSearch reports 0.8/"fallback"
// for perfect and garbage matches alike — so the gate compares the street
// the user typed with the street that came back, plus the borough when the
// query names one.
export function assessGeocode(
  queriedAddress: string,
  candidate: BblResult,
): { ok: boolean; reason?: string } {
  const queriedStreet = stripBoroughs(normalizeStreetName(streetPart(queriedAddress)));
  const candidateStreet = normalizeStreetName(streetPart(candidate.normalizedAddress));

  if (queriedStreet === "" || queriedStreet !== candidateStreet) {
    return {
      ok: false,
      reason: `GeoSearch matched "${queriedAddress}" to "${candidate.normalizedAddress}" — a different street. Check the address and borough.`,
    };
  }

  const queriedBorough = BOROUGHS.find(borough =>
    ` ${normalizeStreetName(queriedAddress)} `.includes(` ${borough} `),
  );
  if (queriedBorough && candidate.borough.toUpperCase() !== queriedBorough) {
    return {
      ok: false,
      reason: `"${queriedAddress}" names ${titleCase(queriedBorough)}, but the match sits in ${candidate.borough}.`,
    };
  }

  return { ok: true };
}

const BOROUGHS = ["MANHATTAN", "BROOKLYN", "QUEENS", "BRONX", "STATEN ISLAND"];

const STREET_ABBREVIATIONS: Record<string, string> = {
  ST: "STREET",
  AVE: "AVENUE",
  AV: "AVENUE",
  BLVD: "BOULEVARD",
  RD: "ROAD",
  DR: "DRIVE",
  LN: "LANE",
  PL: "PLACE",
  CT: "COURT",
  PKWY: "PARKWAY",
  TER: "TERRACE",
  SQ: "SQUARE",
  E: "EAST",
  W: "WEST",
  N: "NORTH",
  S: "SOUTH",
};

// "345 PARK AVENUE, New York, NY, USA" -> "PARK AVENUE";
// "58-01 Grand Avenue, Queens" -> "Grand Avenue".
function streetPart(address: string): string {
  return address
    .trim()
    .replace(/^\d+(?:-\d+)?\s+/, "")
    .split(",")[0]
    .trim();
}

// Uppercase, expand suffix abbreviations, drop ordinal suffixes so
// "350 5th Ave" and "350 5 AVENUE" compare equal.
function normalizeStreetName(text: string): string {
  return text
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(token => STREET_ABBREVIATIONS[token] ?? token)
    .map(token => token.replace(/^(\d+)(?:ST|ND|RD|TH)$/, "$1"))
    .join(" ");
}

// A comma-less query like "345 Park Avenue Manhattan" leaves the borough
// glued to the street part; strip it before comparing.
function stripBoroughs(street: string): string {
  let stripped = ` ${street} `;
  for (const borough of BOROUGHS) {
    stripped = stripped.replace(` ${borough} `, " ");
  }
  return stripped.trim();
}

function titleCase(words: string): string {
  return words
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function lookupBbl(address: string): Promise<BblResult> {
  const url = `${GEOSEARCH_URL}?text=${encodeURIComponent(address)}`;
  const response = await cachedFetchJson<GeoSearchResponse>(url, {
    service: "GeoSearch",
  });

  return parseBblResponse(response, address);
}

// All ranked candidates, for callers that can cross-check against another
// dataset — GeoSearch's top pick is sometimes a different tax lot than the
// one DOF files under (see "1 Pike Street").
export async function lookupBblCandidates(
  address: string,
  onStale?: (info: StaleSnapshot) => void,
): Promise<BblResult[]> {
  const url = `${GEOSEARCH_URL}?text=${encodeURIComponent(address)}`;
  const response = await cachedFetchJson<GeoSearchResponse>(url, {
    service: "GeoSearch",
    onStale,
  });

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
      bin: feature.properties.addendum?.pad?.bin ?? null,
      normalizedAddress: feature.properties.label ?? queriedAddress,
      borough: feature.properties.borough ?? "unknown",
      confidence: feature.properties.confidence ?? null,
      matchType: feature.properties.match_type ?? null,
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
    bin: topMatch.properties.addendum?.pad?.bin ?? null,
    normalizedAddress: topMatch.properties.label ?? queriedAddress,
    borough: topMatch.properties.borough ?? "unknown",
    confidence: topMatch.properties.confidence ?? null,
    matchType: topMatch.properties.match_type ?? null,
  };
}

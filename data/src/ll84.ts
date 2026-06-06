// BBL -> building facts via the LL84 benchmarking disclosure dataset
// (Socrata 5zyy-y8am on data.cityofnewyork.us): gross floor area, property
// uses, reported emissions. Returns null when the building has no filing —
// plenty don't, and the orchestrator must degrade honestly.

import { fetchJson } from "./http.ts";
import type { Bbl, Ll84Facts, UseSplit } from "./types.ts";

const LL84_URL = "https://data.cityofnewyork.us/resource/5zyy-y8am.json";

// LL84 spells some uses differently than the penalty rule (1 RCNY 103-14),
// which is the vocabulary the engine accepts. Names not listed here pass
// through unchanged.
const LL84_USE_TO_ESPM: Record<string, string> = {
  "Community Center and Social Meeting Hall": "Social/Meeting Hall",
};

interface Ll84Row {
  report_year?: string;
  property_name?: string;
  address_1?: string;
  property_gfa_calculated?: string;
  property_gfa_self_reported?: string;
  list_of_all_property_use?: string;
  total_location_based_ghg?: string;
}

export async function fetchLl84(bbl: Bbl): Promise<Ll84Facts | null> {
  const query = new URLSearchParams({
    nyc_borough_block_and_lot: bbl,
    $order: "report_year DESC",
    $limit: "10",
  });

  const token = globalThis.process?.env?.SOCRATA_APP_TOKEN;
  if (token) {
    query.set("$$app_token", token);
  }

  const rows = await fetchJson<Ll84Row[]>(`${LL84_URL}?${query}`, { service: "LL84" });

  return parseLl84Rows(rows, bbl);
}

export function parseLl84Rows(rows: Ll84Row[], bbl: Bbl): Ll84Facts | null {
  if (rows.length === 0) {
    return null;
  }

  const latestFiling = [...rows].sort(
    (a, b) => (parseNumber(b.report_year) ?? 0) - (parseNumber(a.report_year) ?? 0),
  )[0];

  return {
    bbl,
    reportedAddress: latestFiling.property_name ?? latestFiling.address_1 ?? null,
    grossFloorAreaSqft:
      parseNumber(latestFiling.property_gfa_calculated) ??
      parseNumber(latestFiling.property_gfa_self_reported),
    occupancyGroups: parseUseList(latestFiling.list_of_all_property_use),
    annualEmissionsTco2e: parseNumber(latestFiling.total_location_based_ghg),
    reportingYear: parseNumber(latestFiling.report_year),
  };
}

// The dataset writes "Not Available" (and friends) instead of leaving a
// field empty. Anything that isn't a clean number becomes null.
function parseNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// list_of_all_property_use reads like:
//   "Restaurant (50021.0), Personal Services (Health/Beauty, Dry Cleaning,
//    etc.) (5422.0), Office (2692475.1)"
// Use names can contain commas and parentheses, so the only reliable
// delimiter is the trailing "(<number>)" after each name.
function parseUseList(useList: string | undefined): UseSplit[] {
  if (!useList) {
    return [];
  }

  const uses: UseSplit[] = [];
  const usePattern = /(.+?)\s\((\d+(?:\.\d+)?)\)(?:,\s|$)/g;

  for (const [, name, sqft] of useList.matchAll(usePattern)) {
    const espmName = LL84_USE_TO_ESPM[name] ?? name;
    uses.push({ group: espmName, sqft: Number(sqft) });
  }

  return uses;
}

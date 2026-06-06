// BBL -> building facts via the LL84 benchmarking disclosure dataset
// (Socrata 5zyy-y8am on data.cityofnewyork.us): gross floor area, property
// uses, reported emissions. Returns null when the building has no filing —
// plenty don't, and the orchestrator must degrade honestly.

import { fetchJson } from "./http.ts";
import type { Bbl, Ll84Facts, UseSplit } from "./types.ts";

const LL84_URL = "https://data.cityofnewyork.us/resource/5zyy-y8am.json";

// LL84 self-reported names versus the penalty rule's factor table
// (1 RCNY 103-14(d)(3), the vocabulary the engine accepts). Tables verified
// against a dataset-wide sweep of distinct use names, 2026-06-06.
//
// Renames: the same ESPM type under a newer or longer name. Exact mapping,
// nothing to disclose.
const LL84_USE_RENAMES: Record<string, string> = {
  "Community Center and Social Meeting Hall": "Social/Meeting Hall",
  "Senior Living Community": "Senior Care Community",
  "Vehicle Repair Services": "Repair Services (Vehicle, Shoe, Locksmith, etc.)",
  "Vehicle Dealership": "Automobile Dealership",
};

// Proxies: types the rule's table simply doesn't list. Each maps to the
// nearest listed bucket; the mapping is this layer's editorial judgment and
// is reported in Ll84Facts.proxiedUses.
const LL84_USE_PROXIES: Record<string, string> = {
  "Fire Station": "Other - Public Services",
  "Police Station": "Other - Public Services",
  "Prison/Incarceration": "Other - Public Services",
  "Wastewater Treatment Plant": "Other - Public Services",
  "Fast Food Restaurant": "Restaurant",
  "Bar/Nightclub": "Other - Restaurant/Bar",
  Zoo: "Other - Entertainment/Public Assembly",
  Aquarium: "Other - Entertainment/Public Assembly",
  "Convention Center": "Other - Entertainment/Public Assembly",
  "Stadium (Open)": "Other - Entertainment/Public Assembly",
  "Indoor Arena": "Other - Entertainment/Public Assembly",
  "Other - Stadium": "Other - Entertainment/Public Assembly",
  "Ice/Curling Rink": "Other - Recreation",
  "Heated Swimming Pool": "Other - Recreation",
  "Electric Vehicle Charging Station": "Parking",
  "Single-Family Home": "Other - Lodging/Residential",
  "Veterinary Office": "Other - Services",
};

// No defensible factor exists for these; they are excluded from the
// engine's input and surfaced in Ll84Facts.unmappedUses instead.
const LL84_USE_UNMAPPABLE = new Set([
  "Other",
  "Not Available",
  "Other - Utility",
  "Energy/Power Station",
  "Drinking Water Treatment & Distribution",
]);

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

  // Latest year wins; within a year, campus lots can file parent and child
  // rows, and the parent (largest floor area) is the whole-lot picture.
  const latestFiling = [...rows].sort(
    (a, b) =>
      (parseNumber(b.report_year) ?? 0) - (parseNumber(a.report_year) ?? 0) ||
      (floorArea(b) ?? 0) - (floorArea(a) ?? 0),
  )[0];

  const { mapped, proxied, unmapped } = mapUseList(latestFiling.list_of_all_property_use);

  return {
    bbl,
    reportedAddress: latestFiling.property_name ?? latestFiling.address_1 ?? null,
    grossFloorAreaSqft: floorArea(latestFiling),
    occupancyGroups: mapped,
    annualEmissionsTco2e: parseNumber(latestFiling.total_location_based_ghg),
    reportingYear: parseNumber(latestFiling.report_year),
    proxiedUses: proxied,
    unmappedUses: unmapped,
  };
}

function floorArea(row: Ll84Row): number | null {
  return (
    parseNumber(row.property_gfa_calculated) ??
    parseNumber(row.property_gfa_self_reported)
  );
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
function mapUseList(useList: string | undefined): {
  mapped: UseSplit[];
  proxied: Array<{ from: string; to: string }>;
  unmapped: UseSplit[];
} {
  const mapped: UseSplit[] = [];
  const proxied: Array<{ from: string; to: string }> = [];
  const unmapped: UseSplit[] = [];

  if (!useList) {
    return { mapped, proxied, unmapped };
  }

  const usePattern = /(.+?)\s\((\d+(?:\.\d+)?)\)(?:,\s|$)/g;
  for (const [, name, sqftText] of useList.matchAll(usePattern)) {
    const sqft = Number(sqftText);

    if (LL84_USE_UNMAPPABLE.has(name)) {
      unmapped.push({ group: name, sqft });
      continue;
    }

    const renamed = LL84_USE_RENAMES[name];
    if (renamed) {
      mapped.push({ group: renamed, sqft });
      continue;
    }

    const proxy = LL84_USE_PROXIES[name];
    if (proxy) {
      mapped.push({ group: proxy, sqft });
      proxied.push({ from: name, to: proxy });
      continue;
    }

    mapped.push({ group: name, sqft });
  }

  return { mapped, proxied, unmapped };
}

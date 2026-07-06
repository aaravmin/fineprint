// BBL -> building facts via the LL84 benchmarking disclosure dataset
// (Socrata 5zyy-y8am on data.cityofnewyork.us): gross floor area, property
// uses, reported emissions. Returns null when the building has no filing —
// plenty don't, and the orchestrator must degrade honestly.

import { cachedFetchJson } from "./http.ts";
import type { Bbl, Ll84Facts, Ll84FuelUse, UseSplit } from "./types.ts";

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

// kBtu per kWh: the unit bridge between metered electricity and the kBtu every
// other fuel column reports. Exported for the personalization layer's heat-pump
// math, which converts delivered heat back into the electricity a pump draws.
export const KBTU_PER_KWH = 3.412;

// Grid electricity's statutory emissions factor, tCO2e per kWh, from Admin Code
// 28-320.3.1.1 (the same figure the electricity column below is priced with).
// Exported so the personalization layer prices heat-pump electricity with the
// statute's coefficient instead of restating it.
export const ELECTRICITY_TCO2E_PER_KWH = 0.000288962;

// Every fuel-use column an LL84 filing can report, in one table. `coefficient`
// prices the fuel in tCO2e per native unit (per kBtu, or per kWh for
// electricity) as DOB prices them for 2024-2029 penalties; null marks a fuel
// with no verified coefficient, so its energy is still recorded but its tCO2e
// stays null instead of nuking the whole recompute. `role` sorts a column into
// the building's fuel mix: a heating/hot-water source, purchased electricity,
// or an "other" load (district cooling, on-site generation) the mix ignores.
//
// Coefficient sources: Admin Code 28-320.3.1.1 (gas, oils, steam, electricity;
// echoed in DOB's June 2024 guidance,
// https://www.nyc.gov/assets/buildings/pdf/ll97_emissions.pdf) and
// 1 RCNY 103-14(d)(3)(i) (diesel, kerosene, propane), verified 2026-06-06.
interface FuelColumn {
  column: string;
  label: string;
  unit: "kbtu" | "kwh";
  coefficient: number | null;
  role: "heating" | "electricity" | "other";
}

const FUEL_COLUMNS: FuelColumn[] = [
  {
    column: "natural_gas_use_kbtu",
    label: "natural_gas",
    unit: "kbtu",
    coefficient: 0.00005311,
    role: "heating",
  },
  {
    column: "fuel_oil_1_use_kbtu",
    label: "fuel_oil_1",
    unit: "kbtu",
    coefficient: 0.0000735,
    role: "heating",
  },
  {
    column: "fuel_oil_2_use_kbtu",
    label: "fuel_oil_2",
    unit: "kbtu",
    coefficient: 0.00007421,
    role: "heating",
  },
  {
    column: "fuel_oil_4_use_kbtu",
    label: "fuel_oil_4",
    unit: "kbtu",
    coefficient: 0.00007529,
    role: "heating",
  },
  {
    column: "diesel_2_use_kbtu",
    label: "diesel_2",
    unit: "kbtu",
    coefficient: 0.00007421,
    role: "heating",
  },
  {
    column: "propane_use_kbtu",
    label: "propane",
    unit: "kbtu",
    coefficient: 0.00006425,
    role: "heating",
  },
  {
    column: "kerosene_use_kbtu",
    label: "kerosene",
    unit: "kbtu",
    coefficient: 0.00007769,
    role: "heating",
  },
  {
    column: "district_steam_use_kbtu",
    label: "district_steam",
    unit: "kbtu",
    coefficient: 0.00004493,
    role: "heating",
  },
  // No. 5/6 oil and district hot water are heating sources the statute prices
  // differently, so they carry no coefficient and any consumption blocks the
  // recompute (see recomputeEmissions).
  {
    column: "fuel_oil_5_6_use_kbtu",
    label: "fuel_oil_5_6",
    unit: "kbtu",
    coefficient: null,
    role: "heating",
  },
  {
    column: "district_hot_water_use_kbtu",
    label: "district_hot_water",
    unit: "kbtu",
    coefficient: null,
    role: "heating",
  },
  {
    column: "electricity_use_grid_purchase_1",
    label: "electricity",
    unit: "kwh",
    coefficient: ELECTRICITY_TCO2E_PER_KWH,
    role: "electricity",
  },
  // District cooling and on-site generation are neither heating nor a purchased
  // fuel; they are unpriceable and stay out of the heating-fuel pick.
  {
    column: "district_chilled_water_use",
    label: "district_chilled_water",
    unit: "kbtu",
    coefficient: null,
    role: "other",
  },
  {
    column: "electricity_use_generated",
    label: "electricity_generated",
    unit: "kwh",
    coefficient: null,
    role: "other",
  },
];

const ELECTRICITY_COLUMN = "electricity_use_grid_purchase_1";

// The role a fuel column plays in a building's energy, keyed by the raw column
// name Ll84FuelUse carries. Exposed so the systems dossier can split emissions
// between heating, electricity, and other loads without re-listing the fuel
// taxonomy that lives here. Null for a column outside the table.
export function fuelRole(column: string): "heating" | "electricity" | "other" | null {
  return FUEL_COLUMNS.find(fuel => fuel.column === column)?.role ?? null;
}

interface Ll84Row {
  report_year?: string;
  property_name?: string;
  address_1?: string;
  property_gfa_calculated?: string;
  property_gfa_self_reported?: string;
  list_of_all_property_use?: string;
  total_location_based_ghg?: string;
  site_eui_kbtu_ft?: string;
  energy_star_score?: string;
  [fuelColumn: string]: string | undefined;
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

  const rows = await cachedFetchJson<Ll84Row[]>(`${LL84_URL}?${query}`, {
    service: "LL84",
  });

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
  const { recomputed, unpriceable } = recomputeEmissions(latestFiling);
  const { fuelMix, heatingFuel } = deriveFuels(latestFiling);
  const { fuelUse, electricityKwh } = collectFuelUse(latestFiling);

  return {
    bbl,
    reportedAddress: latestFiling.property_name ?? latestFiling.address_1 ?? null,
    grossFloorAreaSqft: floorArea(latestFiling),
    occupancyGroups: mapped,
    annualEmissionsTco2e: parseNumber(latestFiling.total_location_based_ghg),
    recomputedEmissionsTco2e: recomputed,
    unpriceableFuels: unpriceable,
    fuelUse,
    electricityKwh,
    reportingYear: parseNumber(latestFiling.report_year),
    proxiedUses: proxied,
    unmappedUses: unmapped,
    fuelMix,
    heatingFuel,
    siteEuiKbtuPerSqft: parseNumber(latestFiling.site_eui_kbtu_ft),
    energyStarScore: parseNumber(latestFiling.energy_star_score),
  };
}

// The building's fuel mix from its non-zero use columns, ordered by energy.
// heatingFuel is the largest combustion/district source; an all-electric
// building reports "electricity"; a filing with no fuel use reports null.
function deriveFuels(row: Ll84Row): { fuelMix: string[]; heatingFuel: string | null } {
  const consumption: Array<{ fuel: string; kbtu: number; isHeating: boolean }> = [];
  let electricityPresent = false;

  for (const fuel of FUEL_COLUMNS) {
    if (fuel.role === "other") {
      continue;
    }
    const consumed = parseNumber(row[fuel.column]) ?? 0;
    if (consumed <= 0) {
      continue;
    }

    const kbtu = fuel.unit === "kwh" ? consumed * KBTU_PER_KWH : consumed;
    consumption.push({ fuel: fuel.label, kbtu, isHeating: fuel.role === "heating" });
    if (fuel.role === "electricity") {
      electricityPresent = true;
    }
  }

  consumption.sort((a, b) => b.kbtu - a.kbtu);

  const topHeatingFuel = consumption.find(entry => entry.isHeating)?.fuel;
  const heatingFuel = topHeatingFuel ?? (electricityPresent ? "electricity" : null);

  return { fuelMix: consumption.map(entry => entry.fuel), heatingFuel };
}

// Per-fuel energy and emissions for every consumed column: the priced fuels,
// the unpriceable ones (tCO2e null), electricity, and other loads alike. This
// keeps the fuel detail the recompute would otherwise discard, so the systems
// dossier can attribute emissions rather than working from one total. kBtu is
// the common unit (electricity converted from its native kWh).
function collectFuelUse(row: Ll84Row): {
  fuelUse: Ll84FuelUse[];
  electricityKwh: number | null;
} {
  const fuelUse: Ll84FuelUse[] = [];

  for (const fuel of FUEL_COLUMNS) {
    const consumed = parseNumber(row[fuel.column]);
    if (consumed === null || consumed <= 0) {
      continue;
    }

    fuelUse.push({
      fuel: fuel.label,
      column: fuel.column,
      kbtu: fuel.unit === "kwh" ? consumed * KBTU_PER_KWH : consumed,
      tco2e: fuel.coefficient === null ? null : consumed * fuel.coefficient,
    });
  }

  return { fuelUse, electricityKwh: parseNumber(row[ELECTRICITY_COLUMN]) };
}

// ESPM's location-based GHG prices electricity with national eGRID factors;
// DOB's penalty math uses the statute's coefficients. Recompute the
// emissions the DOB way from the filing's fuel columns. Returns null when
// any consumed fuel has no verified coefficient — falling back beats
// pretending.
function recomputeEmissions(row: Ll84Row): {
  recomputed: number | null;
  unpriceable: string[];
} {
  const unpriceable = FUEL_COLUMNS.filter(
    fuel => fuel.coefficient === null && (parseNumber(row[fuel.column]) ?? 0) > 0,
  ).map(fuel => fuel.column);
  if (unpriceable.length > 0) {
    return { recomputed: null, unpriceable };
  }

  let totalTco2e = 0;
  let pricedAnything = false;

  for (const fuel of FUEL_COLUMNS) {
    if (fuel.coefficient === null) {
      continue;
    }
    const consumed = parseNumber(row[fuel.column]);
    if (consumed !== null && consumed > 0) {
      totalTco2e += consumed * fuel.coefficient;
      pricedAnything = true;
    }
  }

  if (!pricedAnything) {
    return { recomputed: null, unpriceable: [] };
  }

  return { recomputed: Math.round(totalTco2e * 100) / 100, unpriceable: [] };
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

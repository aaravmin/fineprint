// Tax-lot characteristics from PLUTO (Socrata 64uk-42ks), keyed by BBL. One
// row per lot, so this returns a single record or null. PLUTO stores numbers
// as zero-padded float strings ("102.0000000"), which we parse to numbers.

import type { Bbl, PlutoCharacteristics } from "./types.ts";
import { fetchAllRows } from "./socrata.ts";

const PLUTO_DATASET = "64uk-42ks";

interface PlutoRow {
  bbl?: string;
  numfloors?: string;
  bldgclass?: string;
  bldgarea?: string;
  unitsres?: string;
  unitstotal?: string;
  yearbuilt?: string;
  landuse?: string;
  ownername?: string;
  [k: string]: string | undefined;
}

export async function fetchPlutoByBbl(bbl: Bbl): Promise<PlutoCharacteristics | null> {
  const rows = await fetchAllRows<PlutoRow>(PLUTO_DATASET, { bbl }, "PLUTO");

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    bbl,
    numFloors: parseNumber(row.numfloors),
    buildingClass: row.bldgclass ?? null,
    bldgAreaSqft: parseNumber(row.bldgarea),
    unitsResidential: parseNumber(row.unitsres),
    unitsTotal: parseNumber(row.unitstotal),
    yearBuilt: parseNumber(row.yearbuilt),
    landUse: row.landuse ?? null,
    ownerName: row.ownername ?? null,
    raw: row as Record<string, unknown>,
  };
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default fetchPlutoByBbl;

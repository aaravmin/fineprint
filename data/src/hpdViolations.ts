// HPD Housing Maintenance Code violations (Socrata wvxf-dwi5), keyed by bin.
// Recon expected no BIN or BBL column, but the dataset now carries a populated
// bin, so we key by it like every other DOB/HPD source. A big pre-war building
// can carry thousands of rows over its life, so we floor at ten years and order
// newest-first: recent heat/hot-water violations are the signal we want, not a
// 1990s paint citation. Class C is immediately hazardous.

import type { Bin, HpdViolation } from "./types.ts";
import { DATASET, fetchAllRows } from "./socrata.ts";
import { isoYearsAgo } from "./recordWindow.ts";

interface HpdViolationRow {
  violationid?: string;
  bin?: string;
  class?: string;
  novtype?: string;
  novdescription?: string;
  novissueddate?: string;
  currentstatus?: string;
  currentstatusdate?: string;
  inspectiondate?: string;
  apartment?: string;
  rentimpairing?: string;
  [k: string]: string | undefined;
}

export async function fetchHpdViolationsByBin(bin: Bin): Promise<HpdViolation[]> {
  const rows = await fetchAllRows<HpdViolationRow>(
    DATASET.hpdViolations,
    {
      bin,
      $where: `novissueddate > '${isoYearsAgo(10)}'`,
      $order: "novissueddate DESC",
    },
    "HPD Violations",
  );

  return parseHpdViolationRows(rows);
}

export function parseHpdViolationRows(rows: HpdViolationRow[]): HpdViolation[] {
  return rows.map(row => ({
    violationId: row.violationid ?? "",
    bin: row.bin ?? null,
    violationClass: row.class ?? null,
    novType: row.novtype ?? null,
    description: collapseWhitespace(row.novdescription),
    novIssuedDate: row.novissueddate ?? null,
    currentStatus: row.currentstatus ?? null,
    currentStatusDate: row.currentstatusdate ?? null,
    inspectionDate: row.inspectiondate ?? null,
    apartment: row.apartment ?? null,
    rentImpairing: parseYesNo(row.rentimpairing),
    raw: row as Record<string, unknown>,
  }));
}

function collapseWhitespace(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return value.replace(/\s+/g, " ").trim();
}

function parseYesNo(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null;
  }
  return value.trim().toUpperCase() === "Y";
}

export default fetchHpdViolationsByBin;

// DOB violations (Socrata 3h2n-5cm9), keyed by bin. Recon expected no BIN
// column, but the dataset carries one and it is populated for building-tied
// rows (the placeholder rows without a bin are orphan device citations that do
// not belong to a specific building). The type code is the signal: E for
// elevator, LBLVIO for a low-pressure boiler, and the category says whether it
// is still active. No date floor - a few hundred rows even for a big building,
// and the older ones are real equipment history.

import type { Bin, DobViolation } from "./types.ts";
import { DATASET, fetchAllRows } from "./socrata.ts";

interface DobViolationRow {
  violation_number?: string;
  isn_dob_bis_viol?: string;
  bin?: string;
  violation_type_code?: string;
  violation_type?: string;
  violation_category?: string;
  issue_date?: string;
  device_number?: string;
  description?: string;
  [k: string]: string | undefined;
}

export async function fetchDobViolationsByBin(bin: Bin): Promise<DobViolation[]> {
  const rows = await fetchAllRows<DobViolationRow>(
    DATASET.dobViolations,
    { bin, $order: "issue_date DESC" },
    "DOB Violations",
  );

  return parseDobViolationRows(rows);
}

export function parseDobViolationRows(rows: DobViolationRow[]): DobViolation[] {
  return rows.map(row => ({
    violationNumber: row.violation_number ?? "",
    isnDobBisViol: row.isn_dob_bis_viol ?? null,
    bin: row.bin ?? null,
    violationTypeCode: row.violation_type_code ?? null,
    violationType: collapseWhitespace(row.violation_type),
    violationCategory: row.violation_category ?? null,
    issueDate: row.issue_date ?? null,
    deviceNumber: row.device_number ?? null,
    description: collapseWhitespace(row.description),
    raw: row as Record<string, unknown>,
  }));
}

// The type label and the description are stored padded with runs of spaces;
// collapse them to a single readable line.
function collapseWhitespace(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return value.replace(/\s+/g, " ").trim();
}

export default fetchDobViolationsByBin;

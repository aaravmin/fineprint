// Open ECB violations and their penalty amounts from DOB (Socrata 6bgk-3dad).
// Keyed by BIN. Only ACTIVE violations are fetched: a resolved violation is
// no longer an outstanding obligation, so the board never surfaces it.

import type { Bin, EcbViolation } from "./types.ts";
import { DATASET, fetchAllRows } from "./socrata.ts";

interface EcbRow {
  ecb_violation_number?: string;
  dob_violation_number?: string;
  bin?: string;
  ecb_violation_status?: string;
  violation_type?: string;
  severity?: string;
  infraction_code1?: string;
  section_law_description1?: string;
  violation_description?: string;
  issue_date?: string;
  penality_imposed?: string; // the dataset's own spelling
  amount_paid?: string;
  balance_due?: string;
  [k: string]: string | undefined;
}

export async function fetchOpenEcbViolationsByBin(bin: Bin): Promise<EcbViolation[]> {
  const rows = await fetchAllRows<EcbRow>(
    DATASET.ecbViolations,
    { bin, ecb_violation_status: "ACTIVE" },
    "ECB Violations",
  );

  return rows.map(row => ({
    ecbViolationNumber: row.ecb_violation_number ?? "",
    dobViolationNumber: row.dob_violation_number ?? null,
    bin: row.bin ?? null,
    status: row.ecb_violation_status ?? null,
    violationType: row.violation_type ?? null,
    severity: row.severity ?? null,
    infractionCode: row.infraction_code1 ?? null,
    sectionLaw: collapseWhitespace(row.section_law_description1),
    description: collapseWhitespace(row.violation_description),
    issueDate: row.issue_date ?? null,
    penaltyImposedUsd: parseUsd(row.penality_imposed),
    amountPaidUsd: parseUsd(row.amount_paid),
    balanceDueUsd: parseUsd(row.balance_due),
    raw: row as Record<string, unknown>,
  }));
}

// The citation and its description are stored in one field padded with runs of
// spaces; collapse them to a single readable line.
function collapseWhitespace(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return value.replace(/\s+/g, " ").trim();
}

function parseUsd(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export default fetchOpenEcbViolationsByBin;

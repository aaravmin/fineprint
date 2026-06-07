// FISP facade compliance filings from DOB NOW: Safety – Facades (Socrata
// xubg-57si). BIN-keyed. The dataset mixes real submissions with
// auto-generated "No Report Filed" placeholder rows DOB creates when a window
// closes unfiled, so callers must separate the two — a placeholder is evidence
// of NON-filing, not of a report.

import type { Bin, FacadeFiling } from "./types.ts";
import { DATASET, fetchAllRows } from "./socrata.ts";

interface FacadeRow {
  tr6_no?: string;
  control_no?: string;
  filing_type?: string;
  cycle?: string;
  bin?: string;
  current_status?: string;
  filing_status?: string;
  sequence_no?: string;
  [k: string]: string | undefined;
}

export async function fetchFacadeFilingsByBin(bin: Bin): Promise<FacadeFiling[]> {
  const rows = await fetchAllRows<FacadeRow>(
    DATASET.dobNowSafetyFacades,
    { bin },
    "Facades",
  );

  return rows.map(row => ({
    tr6Number: row.tr6_no ?? "",
    bin: row.bin ?? null,
    cycle: row.cycle ?? null,
    filingType: row.filing_type ?? null,
    filingStatus: row.filing_status ?? null,
    currentStatus: row.current_status ?? null,
    raw: row as Record<string, unknown>,
  }));
}

export default fetchFacadeFilingsByBin;

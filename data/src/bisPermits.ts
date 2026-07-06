// DOB permit history from the legacy Buildings Information System (Socrata
// ipu4-2q9a: "DOB Permit Issuance"), keyed by bin__. Records reach back to the
// late 1980s, so this is the deepest vintage signal Fineprint has: a BL boiler
// permit in 1994 dates the plant. No date floor - the whole history is the
// point - but rows are ordered newest-first so the recent picture reads first.

import type { Bin, BisPermit } from "./types.ts";
import { DATASET, fetchAllRows } from "./socrata.ts";

interface BisPermitRow {
  job__?: string;
  permit_si_no?: string;
  bin__?: string;
  job_type?: string;
  work_type?: string;
  permit_type?: string;
  permit_subtype?: string;
  permit_status?: string;
  filing_date?: string;
  issuance_date?: string;
  expiration_date?: string;
  [k: string]: string | undefined;
}

export async function fetchBisPermitsByBin(bin: Bin): Promise<BisPermit[]> {
  const rows = await fetchAllRows<BisPermitRow>(
    DATASET.dobPermitIssuance,
    { bin__: bin, $order: "issuance_date DESC" },
    "BIS Permits",
  );

  return parseBisPermitRows(rows);
}

export function parseBisPermitRows(rows: BisPermitRow[]): BisPermit[] {
  return rows.map(row => ({
    jobNumber: row.job__ ?? "",
    permitSiNo: row.permit_si_no ?? null,
    bin: row.bin__ ?? null,
    jobType: row.job_type ?? null,
    workType: row.work_type ?? null,
    permitType: row.permit_type ?? null,
    permitSubtype: row.permit_subtype ?? null,
    permitStatus: row.permit_status ?? null,
    filingDate: row.filing_date ?? null,
    issuanceDate: row.issuance_date ?? null,
    expirationDate: row.expiration_date ?? null,
    raw: row as Record<string, unknown>,
  }));
}

export default fetchBisPermitsByBin;

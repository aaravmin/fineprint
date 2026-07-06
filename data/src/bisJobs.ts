// DOB job application filings from the legacy Buildings Information System
// (Socrata ic3t-wcy2: "DOB Job Application Filings"), keyed by bin__. Where
// bisPermits says a permit was pulled, this says what the job was: the
// free-text job_description names boiler, oil-to-gas, heat pump, chiller, roof,
// window, solar, or service-upgrade work. The classification lives downstream
// so this layer stays a faithful mirror of the record.

import type { Bin, BisJobFiling } from "./types.ts";
import { DATASET, fetchAllRows } from "./socrata.ts";

interface BisJobRow {
  job__?: string;
  bin__?: string;
  bbl?: string;
  job_type?: string;
  job_status_descrp?: string;
  job_description?: string;
  pre__filing_date?: string;
  approved?: string;
  latest_action_date?: string;
  [k: string]: string | undefined;
}

export async function fetchBisJobFilingsByBin(bin: Bin): Promise<BisJobFiling[]> {
  const rows = await fetchAllRows<BisJobRow>(
    DATASET.dobJobApplicationsLegacy,
    { bin__: bin, $order: "pre__filing_date DESC" },
    "BIS Jobs",
  );

  return parseBisJobRows(rows);
}

export function parseBisJobRows(rows: BisJobRow[]): BisJobFiling[] {
  return rows.map(row => ({
    jobNumber: row.job__ ?? "",
    bin: row.bin__ ?? null,
    bbl: row.bbl ?? null,
    jobType: row.job_type ?? null,
    jobStatus: row.job_status_descrp ?? null,
    description: collapseWhitespace(row.job_description),
    preFilingDate: row.pre__filing_date ?? null,
    approvedDate: row.approved ?? null,
    latestActionDate: row.latest_action_date ?? null,
    raw: row as Record<string, unknown>,
  }));
}

// Job descriptions are typed into fixed-width fields and come back padded with
// runs of spaces; collapse them so a downstream regex reads clean text.
function collapseWhitespace(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return value.replace(/\s+/g, " ").trim();
}

export default fetchBisJobFilingsByBin;

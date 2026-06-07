// Job filing history from DOB NOW: Build — Job Application Filings
// (Socrata w9ak-ipjd). Keyed by BIN. The per-system work-type flags
// (mechanical, boiler, plumbing, solar) are the building-specific signal:
// which systems a building has actually altered, and how recently.

import type { Bin, BuildJobFiling } from "./types.ts";
import { DATASET, fetchAllRows } from "./socrata.ts";

interface BuildJobRow {
  job_filing_number?: string;
  bin?: string;
  bbl?: string;
  job_type?: string;
  filing_status?: string;
  filing_date?: string;
  approved_date?: string;
  job_description?: string;
  mechanical_systems_work_type_?: string;
  boiler_equipment_work_type_?: string;
  plumbing_work_type?: string;
  solar_work_type_?: string;
  [k: string]: string | undefined;
}

export async function fetchBuildJobFilingsByBin(bin: Bin): Promise<BuildJobFiling[]> {
  const rows = await fetchAllRows<BuildJobRow>(
    DATASET.dobNowBuildJobFilings,
    { bin },
    "Build Job Filings",
  );

  return rows.map(row => ({
    jobFilingNumber: row.job_filing_number ?? "",
    bin: row.bin ?? null,
    bbl: row.bbl ?? null,
    jobType: row.job_type ?? null,
    filingStatus: row.filing_status ?? null,
    filingDate: row.filing_date ?? null,
    approvedDate: row.approved_date ?? null,
    description: row.job_description ?? null,
    workTypes: {
      mechanical: isYes(row.mechanical_systems_work_type_),
      boiler: isYes(row.boiler_equipment_work_type_),
      plumbing: isYes(row.plumbing_work_type),
      solar: isYes(row.solar_work_type_),
    },
    raw: row as Record<string, unknown>,
  }));
}

function isYes(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "yes";
}

export default fetchBuildJobFilingsByBin;

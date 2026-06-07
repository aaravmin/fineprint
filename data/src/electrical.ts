// Solar PV and energy-storage evidence from DOB NOW: Electrical permits
// (Socrata dm9a-ab7w), keyed by BIN. The dataset carries no sustainability
// flag, so we read PV and storage from the job description text — an evidence
// signal, not a clean flag.
//
// A server-side LIKE scan on job_description takes ~20s (the column is not
// indexed), while filtering by the indexed bin returns in under a second and a
// building has only a few hundred permits. So we fetch by BIN and classify the
// descriptions here, returning only the solar/storage permits.

import type { Bin, ElectricalPermit } from "./types.ts";
import { fetchAllRows } from "./socrata.ts";

const ELECTRICAL_DATASET = "dm9a-ab7w";

const SOLAR = /\b(solar|photovoltaic|pv)\b/i;
const STORAGE = /battery|energy storage|storage system/i;

interface ElectricalRow {
  filing_number?: string;
  job_filing_number?: string;
  bin?: string;
  job_description?: string;
  filing_status?: string;
  filing_date?: string;
  permit_issued_date?: string;
  [k: string]: string | undefined;
}

export async function fetchSolarElectricalPermitsByBin(
  bin: Bin,
): Promise<ElectricalPermit[]> {
  const rows = await fetchAllRows<ElectricalRow>(
    ELECTRICAL_DATASET,
    {
      bin,
      $select:
        "bin,filing_number,job_filing_number,job_description,filing_status,filing_date,permit_issued_date",
    },
    "Electrical Permits",
  );

  const permits: ElectricalPermit[] = [];
  for (const row of rows) {
    const description = row.job_description ?? "";
    const isSolar = SOLAR.test(description);
    const isStorage = STORAGE.test(description);
    if (!isSolar && !isStorage) {
      continue;
    }

    permits.push({
      filingNumber: row.job_filing_number ?? row.filing_number ?? "",
      bin: row.bin ?? null,
      jobDescription: row.job_description ?? null,
      filingStatus: row.filing_status ?? null,
      filingDate: row.filing_date ?? null,
      permitIssuedDate: row.permit_issued_date ?? null,
      isSolar,
      isStorage,
      raw: row as Record<string, unknown>,
    });
  }

  return permits;
}

export default fetchSolarElectricalPermitsByBin;

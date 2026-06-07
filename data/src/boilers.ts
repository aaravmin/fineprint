// Boiler inventory and inspection history from DOB NOW: Safety Boiler
// (Socrata 52dp-yji6). The dataset is BIN-keyed (bin_number) and has no BBL
// column, so this requires a resolved BIN — a vacant lot with none yields an
// empty list, which the orchestrator reports honestly.

import type { Bin, BoilerRecord } from "./types.ts";
import { DATASET, fetchAllRows } from "./socrata.ts";

interface BoilerRow {
  tracking_number?: string;
  boiler_id?: string;
  bin_number?: string;
  boiler_make?: string;
  pressure_type?: string;
  inspection_type?: string;
  inspection_date?: string;
  defects_exist?: string;
  report_status?: string;
  [k: string]: string | undefined;
}

export async function fetchBoilerRecordsByBin(bin: Bin): Promise<BoilerRecord[]> {
  const rows = await fetchAllRows<BoilerRow>(
    DATASET.dobNowSafetyBoiler,
    { bin_number: bin },
    "Boilers",
  );

  return rows.map(row => ({
    boilerId: row.boiler_id ?? "",
    trackingNumber: row.tracking_number ?? "",
    bin: row.bin_number ?? null,
    make: row.boiler_make ?? null,
    pressureType: row.pressure_type ?? null,
    inspectionType: row.inspection_type ?? null,
    inspectionDate: row.inspection_date ?? null,
    defectsExist: parseYesNo(row.defects_exist),
    reportStatus: row.report_status ?? null,
    raw: row as Record<string, unknown>,
  }));
}

function parseYesNo(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null;
  }
  return value.trim().toLowerCase() === "yes";
}

export default fetchBoilerRecordsByBin;

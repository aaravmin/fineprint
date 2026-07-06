// Elevator devices from DOB NOW: Safety (Socrata e5aq-a4j2), keyed by bin. The
// device count and status feed the elevators system assessment and, together
// with the boiler and mechanical history, help place a building's vertical
// transportation on the retrofit map. Few rows per building, so no date floor.

import type { Bin, ElevatorDevice } from "./types.ts";
import { DATASET, fetchAllRows } from "./socrata.ts";

interface ElevatorRow {
  device_number?: string;
  bin?: string;
  device_type?: string;
  device_status?: string;
  status_date?: string;
  periodic_latest_inspection?: string;
  cat1_report_year?: string;
  [k: string]: string | undefined;
}

export async function fetchElevatorDevicesByBin(bin: Bin): Promise<ElevatorDevice[]> {
  const rows = await fetchAllRows<ElevatorRow>(
    DATASET.dobNowElevator,
    { bin },
    "Elevators",
  );

  return parseElevatorRows(rows);
}

export function parseElevatorRows(rows: ElevatorRow[]): ElevatorDevice[] {
  return rows.map(row => ({
    deviceNumber: row.device_number ?? "",
    bin: row.bin ?? null,
    deviceType: row.device_type ?? null,
    deviceStatus: row.device_status ?? null,
    statusDate: row.status_date ?? null,
    lastPeriodicInspection: row.periodic_latest_inspection ?? null,
    cat1ReportYear: row.cat1_report_year ?? null,
    raw: row as Record<string, unknown>,
  }));
}

export default fetchElevatorDevicesByBin;

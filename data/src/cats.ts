// Boiler and burner registrations from DEP's Clean Air Tracking System
// (Socrata f4rp-2kvy), keyed by bin. Besides LL84, this is the strongest
// heating-fuel and vintage signal we have: the registered primary fuel (No.
// 2/4/6 oil or natural gas), the boiler make and model, and the issue and
// expiration dates that bracket when a boiler was certified to operate. No date
// floor - a lapsed 1990s No. 6 oil registration is precisely the history we
// want.

import type { Bin, CatsPermit } from "./types.ts";
import { DATASET, fetchAllRows } from "./socrata.ts";

interface CatsRow {
  applicationid?: string;
  requestid?: string;
  requesttype?: string;
  bin?: string;
  primaryfuel?: string;
  secondaryfuel?: string;
  make?: string;
  model?: string;
  burnermake?: string;
  burnermodel?: string;
  issuedate?: string;
  expirationdate?: string;
  status?: string;
  [k: string]: string | undefined;
}

export async function fetchCatsPermitsByBin(bin: Bin): Promise<CatsPermit[]> {
  const rows = await fetchAllRows<CatsRow>(
    DATASET.depCatsPermits,
    { bin, $order: "issuedate DESC" },
    "DEP CATS",
  );

  return parseCatsRows(rows);
}

export function parseCatsRows(rows: CatsRow[]): CatsPermit[] {
  return rows.map(row => ({
    applicationId: row.applicationid ?? "",
    requestId: row.requestid ?? null,
    requestType: row.requesttype ?? null,
    bin: row.bin ?? null,
    primaryFuel: row.primaryfuel ?? null,
    secondaryFuel: row.secondaryfuel ?? null,
    make: row.make ?? null,
    model: row.model ?? null,
    burnerMake: row.burnermake ?? null,
    burnerModel: row.burnermodel ?? null,
    issueDate: row.issuedate ?? null,
    expirationDate: row.expirationdate ?? null,
    status: row.status ?? null,
    raw: row as Record<string, unknown>,
  }));
}

export default fetchCatsPermitsByBin;

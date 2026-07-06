// Inspection-driven "act-by" deadlines. The intake already resolves each
// building's inspection and certificate cycles (boiler inspections, elevator
// Cat-1 and periodic tests, DEP clean-air permit expiries), but the only date
// the product ever surfaced was the annual May-1 LL97 filing. This pass turns
// those cycles into a per-system "do the work before this inspection" date, with
// a sensible lead time. Every deadline is keyed to a SystemKey so it belongs to
// an infrastructure category, and dated deterministically from `asOf` (cycles
// roll forward) so the status is stable without re-fetching city data.

import type { BuildingFacts } from "./types.ts";

export type SystemDeadlineKind =
  | "boiler_inspection"
  | "cats_cert_expiry"
  | "elevator_cat1"
  | "elevator_periodic";

export type SystemDeadlineStatus = "upcoming" | "act_soon" | "overdue";

export interface SystemDeadline {
  systemKey: string; // one of the 8 SystemKeys
  kind: SystemDeadlineKind;
  title: string;
  dueDate: string; // ISO — the inspection/cert date the work should precede
  actByDate: string; // ISO — dueDate minus a per-kind lead time
  basis: string; // plain-language explanation
  sourceDataset: string;
  sourceRecordId: string;
  status: SystemDeadlineStatus;
}

const DAY_MS = 86_400_000;

// Lead times: how far ahead of the inspection an owner should have the work
// done. Editorial thresholds — a boiler swap needs less runway than an elevator
// modernization, which needs permits and a long lead on the car.
const LEAD_DAYS: Record<SystemDeadlineKind, number> = {
  boiler_inspection: 90,
  cats_cert_expiry: 120,
  elevator_cat1: 120,
  elevator_periodic: 180,
};

// "Act soon" once the act-by date is within this window of today.
const ACT_SOON_WINDOW_DAYS = 60;

// Roll a repeating cycle forward from its last occurrence to the next one on or
// after asOf. Null when the source date is unparseable.
function nextInCycle(lastIso: string, periodYears: number, asOf: Date): Date | null {
  const base = new Date(lastIso);
  if (Number.isNaN(base.getTime())) {
    return null;
  }
  const next = new Date(base);
  while (next.getTime() <= asOf.getTime()) {
    next.setUTCFullYear(next.getUTCFullYear() + periodYears);
  }
  return next;
}

// Elevator Cat-1 tests report a year, not a date; treat the test as due by the
// end of the following year, rolled forward past asOf.
function nextFromReportYear(yearStr: string, asOf: Date): Date | null {
  const year = Number.parseInt(yearStr, 10);
  if (!Number.isFinite(year)) {
    return null;
  }
  let due = new Date(Date.UTC(year + 1, 11, 31));
  while (due.getTime() <= asOf.getTime()) {
    due = new Date(Date.UTC(due.getUTCFullYear() + 1, 11, 31));
  }
  return due;
}

function statusFor(actBy: Date, asOf: Date): SystemDeadlineStatus {
  if (actBy.getTime() < asOf.getTime()) {
    return "overdue";
  }
  if (actBy.getTime() < asOf.getTime() + ACT_SOON_WINDOW_DAYS * DAY_MS) {
    return "act_soon";
  }
  return "upcoming";
}

function makeDeadline(
  systemKey: string,
  kind: SystemDeadlineKind,
  title: string,
  due: Date,
  basis: string,
  dataset: string,
  recordId: string,
  asOf: Date,
): SystemDeadline {
  const actBy = new Date(due.getTime() - LEAD_DAYS[kind] * DAY_MS);
  return {
    systemKey,
    kind,
    title,
    dueDate: due.toISOString(),
    actByDate: actBy.toISOString(),
    basis,
    sourceDataset: dataset,
    sourceRecordId: recordId,
    status: statusFor(actBy, asOf),
  };
}

export function assessSystemDeadlines(facts: BuildingFacts, asOf: Date): SystemDeadline[] {
  const found: SystemDeadline[] = [];

  for (const boiler of facts.infrastructureProfile?.boilerRecords ?? []) {
    if (!boiler.inspectionDate) {
      continue;
    }
    const due = nextInCycle(boiler.inspectionDate, 1, asOf);
    if (due) {
      found.push(
        makeDeadline(
          "heating_plant",
          "boiler_inspection",
          "Boiler inspection due",
          due,
          `Annual DOB boiler inspection; last on ${boiler.inspectionDate.slice(0, 10)}`,
          "DOB NOW: Safety Boiler",
          boiler.boilerId || boiler.trackingNumber || boiler.inspectionDate,
          asOf,
        ),
      );
    }
  }

  for (const permit of facts.publicRecords.catsPermits ?? []) {
    if (!permit.expirationDate) {
      continue;
    }
    const due = new Date(permit.expirationDate);
    if (Number.isNaN(due.getTime())) {
      continue;
    }
    found.push(
      makeDeadline(
        "heating_plant",
        "cats_cert_expiry",
        "Clean-air permit expires",
        due,
        `DEP Clean Air Tracking System certificate to operate expires ${permit.expirationDate.slice(0, 10)}`,
        "DEP CATS",
        permit.applicationId || permit.expirationDate,
        asOf,
      ),
    );
  }

  for (const device of facts.publicRecords.elevatorDevices ?? []) {
    if (device.deviceStatus && device.deviceStatus.toLowerCase() !== "active") {
      continue;
    }
    if (device.cat1ReportYear) {
      const due = nextFromReportYear(device.cat1ReportYear, asOf);
      if (due) {
        found.push(
          makeDeadline(
            "elevators",
            "elevator_cat1",
            "Elevator Category 1 test due",
            due,
            `Annual elevator Category 1 test; last reported ${device.cat1ReportYear}`,
            "DOB NOW: Elevator",
            device.deviceNumber || device.cat1ReportYear,
            asOf,
          ),
        );
      }
    }
    if (device.lastPeriodicInspection) {
      const due = nextInCycle(device.lastPeriodicInspection, 5, asOf);
      if (due) {
        found.push(
          makeDeadline(
            "elevators",
            "elevator_periodic",
            "Elevator 5-year periodic inspection due",
            due,
            `5-year elevator periodic inspection; last on ${device.lastPeriodicInspection.slice(0, 10)}`,
            "DOB NOW: Elevator",
            device.deviceNumber || device.lastPeriodicInspection,
            asOf,
          ),
        );
      }
    }
  }

  // Many devices produce many rows; keep the soonest act-by per (system, kind)
  // so the deadlines panel shows one line per obligation, not one per boiler.
  const soonest = new Map<string, SystemDeadline>();
  for (const deadline of found) {
    const key = `${deadline.systemKey}:${deadline.kind}`;
    const current = soonest.get(key);
    if (!current || deadline.actByDate < current.actByDate) {
      soonest.set(key, deadline);
    }
  }

  return [...soonest.values()].sort((a, b) => a.actByDate.localeCompare(b.actByDate));
}

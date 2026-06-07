// The filing-status capability: one shape for "what does this procedural law
// require, when is it next due, and is it on record?" — computed for any law
// from the building's attributes and a single asOf date. Procedural laws differ
// only in their cycle rule and which dataset (if any) confirms a filing, so each
// law here is a thin function over the same shared helpers.
//
// Cycle math is pure and takes asOf explicitly — no clocks — so deadlines are
// testable. Where the city publishes no dataset to confirm a filing, onRecord
// is null and we say the status is unknown rather than guess it satisfied.

import type { BuildingFacts } from "./types.ts";
import type { ComplianceStatus } from "./obligations.ts";

export interface FilingStatus {
  lawId: string;
  title: string;
  // Next statutory deadline (ISO date), or null when the cycle can't be dated
  // from the data we hold.
  dueDate: string | null;
  // Plain-language framing of the cycle.
  cycle: string;
  // Whether a qualifying filing is on record. Null when no dataset confirms it.
  onRecord: boolean | null;
  status: ComplianceStatus;
  // The single concrete next action, or null when nothing is needed.
  action: string | null;
  // Where the cycle rule comes from, plus any accuracy caveat.
  basis: string;
}

const MS_PER_DAY = 86_400_000;
const ACTIONABLE_WINDOW_DAYS = 548; // ~18 months: near enough to act on now

// LL84 — annual energy and water benchmarking, due May 1 for the prior
// calendar year's data. The reporting year on file decides currency.
export function ll84FilingStatus(facts: BuildingFacts, asOf: Date): FilingStatus {
  const reportingYear = facts.infrastructureProfile?.ll84ReportingYear ?? null;
  const dueDate = nextAnnualDeadline(asOf, 5, 1);

  // The May 1 deadline in year Y covers data year Y-1; once it has passed, the
  // latest required data year is this year minus one, otherwise minus two.
  const deadlinePassedThisYear = asOf.getMonth() + 1 > 5 || (asOf.getMonth() + 1 === 5 && asOf.getDate() >= 1);
  const requiredDataYear = deadlinePassedThisYear ? asOf.getFullYear() - 1 : asOf.getFullYear() - 2;

  const onRecord = reportingYear !== null;
  let status: ComplianceStatus;
  let action: string | null;

  if (reportingYear === null) {
    status = "due";
    action = "File the LL84 benchmarking report through ENERGY STAR Portfolio Manager.";
  } else if (reportingYear >= requiredDataYear) {
    status = "satisfied";
    action = null;
  } else {
    status = "at_risk";
    action = `Latest filing on record is for ${reportingYear}; submit the ${requiredDataYear} benchmarking report.`;
  }

  return {
    lawId: "ll84",
    title: "Annual energy and water benchmarking",
    dueDate: toIso(dueDate),
    cycle: "Annual, due May 1 for the prior calendar year",
    onRecord,
    status,
    action,
    basis: "LL84 / Admin Code 28-309; filing presence from the LL84 disclosure dataset",
  };
}

// LL87 — energy audit and retro-commissioning, a 10-year cycle whose compliance
// year is keyed to the last digit of the building's tax block. No dataset is
// wired to confirm the filing, so currency is unknown and only the next
// deadline is computed.
export function ll87FilingStatus(facts: BuildingFacts, asOf: Date): FilingStatus {
  const blockLastDigit = taxBlockLastDigit(facts.bbl);
  const dueDate = blockLastDigit === null ? null : nextYearEndingIn(asOf, blockLastDigit);

  const status = nearOrPast(dueDate, asOf) ? "due" : "unknown";

  return {
    lawId: "ll87",
    title: "Energy efficiency report (audit and retro-commissioning)",
    dueDate: dueDate === null ? null : toIso(dueDate),
    cycle:
      blockLastDigit === null
        ? "10-year cycle by tax-block last digit (block undetermined)"
        : `10-year cycle; tax block ends in ${blockLastDigit}`,
    onRecord: null,
    status,
    action:
      "Confirm whether the LL87 energy efficiency report is filed for this cycle; if not, engage an energy auditor.",
    basis:
      "LL87 / Admin Code 28-308; due year derived as the calendar year ending in the tax-block last digit — verify against the DOB LL87 compliance calendar",
  };
}

// LL88 — a one-time deadline (Jan 1, 2025) to bring lighting up to the NYC
// Energy Conservation Code and to submeter large tenant spaces, plus ongoing
// tenant electricity statements. The lighting upgrade is the same physical work
// as the LL97 LED measure, so we point the owner at that plan rather than
// double-count it.
export function ll88FilingStatus(_facts: BuildingFacts, asOf: Date): FilingStatus {
  const deadline = new Date(Date.UTC(2025, 0, 1));
  const passed = asOf.getTime() >= deadline.getTime();

  return {
    lawId: "ll88",
    title: "Lighting upgrade to code and tenant submetering",
    dueDate: "2025-01-01",
    cycle: "One-time upgrade by Jan 1, 2025, plus ongoing tenant submetering statements",
    onRecord: null,
    status: passed ? "due" : "unknown",
    action:
      "Confirm the lighting meets the NYC Energy Conservation Code and large tenant spaces are submetered, then file the LL88 report. The LED lighting retrofit in the LL97 plan also satisfies this upgrade.",
    basis:
      "LL88 / Admin Code 28-310 (lighting) and 28-311 (submetering); compliance evidence is not available in city data",
  };
}

// LL11 / FISP — periodic facade inspection for buildings over six stories, on a
// 5-year cycle with a sub-cycle filing window set by the tax block. The
// sub-cycle window is not yet wired, so the deadline is left undated.
export function ll11FilingStatus(facts: BuildingFacts, _asOf: Date): FilingStatus {
  const stories = facts.plutoCharacteristics?.numFloors ?? null;

  return {
    lawId: "ll11",
    title: "Facade inspection and safety report (FISP)",
    dueDate: null,
    cycle:
      stories === null
        ? "5-year cycle; sub-cycle window set by tax block"
        : `5-year cycle (${stories} stories); sub-cycle window set by tax block`,
    onRecord: null,
    status: "unknown",
    action:
      "Determine this building's FISP sub-cycle window (by tax block) and file the facade report with a licensed inspector.",
    basis:
      "LL11 / Admin Code 28-302; applies to buildings over six stories. Sub-cycle window scheduling not yet wired",
  };
}

// LL152 — periodic gas-piping inspection and certification on a community-
// district cycle. The CD-to-year schedule is not yet wired, so the deadline is
// left undated; the district is surfaced so a human can look it up.
export function ll152FilingStatus(facts: BuildingFacts, _asOf: Date): FilingStatus {
  const cd = facts.plutoCharacteristics?.communityDistrict ?? null;

  return {
    lawId: "ll152",
    title: "Gas piping inspection and certification",
    dueDate: null,
    cycle:
      cd === null
        ? "Periodic certification on a community-district cycle (district unknown)"
        : `Periodic certification on the cycle for community district ${cd}`,
    onRecord: null,
    status: "unknown",
    action:
      "Look up this community district's LL152 filing year and have a licensed master plumber certify the gas piping.",
    basis:
      "LL152 / Admin Code 28-318; filing year set per community district. District-to-year schedule not yet wired",
  };
}

function nextAnnualDeadline(asOf: Date, month: number, day: number): Date {
  const thisYear = new Date(Date.UTC(asOf.getUTCFullYear(), month - 1, day));
  if (thisYear.getTime() >= asOf.getTime()) {
    return thisYear;
  }
  return new Date(Date.UTC(asOf.getUTCFullYear() + 1, month - 1, day));
}

// The next December 31 whose year ends in the given digit, on or after asOf.
function nextYearEndingIn(asOf: Date, lastDigit: number): Date {
  let year = asOf.getUTCFullYear();
  while (year % 10 !== lastDigit) {
    year++;
  }
  let deadline = new Date(Date.UTC(year, 11, 31));
  if (deadline.getTime() < asOf.getTime()) {
    deadline = new Date(Date.UTC(year + 10, 11, 31));
  }
  return deadline;
}

function nearOrPast(deadline: Date | null, asOf: Date): boolean {
  if (deadline === null) {
    return false;
  }
  const daysOut = (deadline.getTime() - asOf.getTime()) / MS_PER_DAY;
  return daysOut <= ACTIONABLE_WINDOW_DAYS;
}

// The tax block is digits 2-6 of a 10-digit BBL (1 borough + 5 block + 4 lot).
function taxBlockLastDigit(bbl: string): number | null {
  const digits = bbl.replace(/\D/g, "");
  if (digits.length !== 10) {
    return null;
  }
  return Number(digits[5]);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

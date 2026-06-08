// The filing-status capability: one shape for "what does this procedural law
// require, when is it next due, and is it on record?" — computed for any law
// from the building's attributes and a single asOf date. Procedural laws differ
// only in their cycle rule and which dataset (if any) confirms a filing, so each
// law here is a thin function over the same shared helpers.
//
// Cycle math is pure and takes asOf explicitly — no clocks — so deadlines are
// testable. Where the city publishes no dataset to confirm a filing, onRecord
// is null and we say the status is unknown rather than guess it satisfied.

import { energyGradeForScore } from "../laws.ts";
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
  const deadlinePassedThisYear =
    asOf.getMonth() + 1 > 5 || (asOf.getMonth() + 1 === 5 && asOf.getDate() >= 1);
  const requiredDataYear = deadlinePassedThisYear
    ? asOf.getFullYear() - 1
    : asOf.getFullYear() - 2;

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
      "LL87 / Admin Code 28-308; due year derived as the calendar year ending in the tax-block last digit — verify against the DOB LL87 compliance calendar. The city's LL87 dataset (au6c-jqvf) is a file attachment, not a queryable table, so filings cannot be confirmed programmatically",
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

// LL33 — the building energy efficiency grade (A-F) derived from the LL84
// ENERGY STAR score, posted near every public entrance. Posting is an annual
// duty tied to the benchmarking cycle; no dataset confirms the physical label
// is up, so onRecord stays null.
export function ll33FilingStatus(facts: BuildingFacts, asOf: Date): FilingStatus {
  const dueDate = nextAnnualDeadline(asOf, 10, 31);
  const score = facts.infrastructureProfile?.energyStarScore ?? null;
  const grade = energyGradeForScore(score);

  const gradeText =
    score === null
      ? "No ENERGY STAR score on the latest LL84 filing — this building posts an N grade."
      : `Latest LL84 ENERGY STAR score ${score} sets a ${grade} grade.`;

  return {
    lawId: "ll33",
    title: "Post the building energy efficiency grade",
    dueDate: toIso(dueDate),
    cycle: `Annual — display the A-F energy label within 30 days of issuance. ${gradeText}`,
    onRecord: null,
    status: "due",
    action:
      score === null
        ? "Post the energy label near every public entrance; with no ENERGY STAR score the grade is N until a benchmarking score is on file."
        : `Post the energy label (grade ${grade}, score ${score}) near every public entrance.`,
    basis:
      "LL33 of 2018 (amended by LL95) / Admin Code 28-309.12.2; grade thresholds " +
      "A 85+, B 70-84, C 55-69, D 20-54, F under 20, N when not score-eligible. " +
      "No dataset confirms the label is posted",
  };
}

// FISP sub-cycles, set by the last digit of the tax block (1 RCNY 103-04).
// Cycle 10 filing windows, per the DOB facade cycle service notice:
//   A (blocks ending 4,5,6,9): Feb 21 2025 - Feb 21 2027
//   B (blocks ending 0,7,8):   Feb 21 2026 - Feb 21 2028
//   C (blocks ending 1,2,3):   Feb 21 2027 - Feb 21 2029
// Each cycle runs 5 years, so later cycles add 5 to both window years.
const FISP_SUBCYCLES: Array<{
  label: string;
  digits: number[];
  cycle10OpenYear: number;
}> = [
  { label: "A", digits: [4, 5, 6, 9], cycle10OpenYear: 2025 },
  { label: "B", digits: [0, 7, 8], cycle10OpenYear: 2026 },
  { label: "C", digits: [1, 2, 3], cycle10OpenYear: 2027 },
];

interface FispWindow {
  label: string;
  opens: Date;
  closes: Date;
}

// The current-or-next FISP filing window for a tax block, as of a date. The
// window is two years long and recurs every five.
function fispWindow(blockLastDigit: number, asOf: Date): FispWindow | null {
  const subcycle = FISP_SUBCYCLES.find(entry => entry.digits.includes(blockLastDigit));
  if (!subcycle) {
    return null;
  }

  let openYear = subcycle.cycle10OpenYear;
  // Walk cycles until the window's close date is ahead of asOf.
  while (new Date(Date.UTC(openYear + 2, 1, 21)).getTime() < asOf.getTime()) {
    openYear += 5;
  }

  return {
    label: subcycle.label,
    opens: new Date(Date.UTC(openYear, 1, 21)),
    closes: new Date(Date.UTC(openYear + 2, 1, 21)),
  };
}

// LL11 / FISP — periodic facade inspection for buildings over six stories, on a
// 5-year cycle whose two-year filing window is set by the tax-block last digit.
export function ll11FilingStatus(facts: BuildingFacts, asOf: Date): FilingStatus {
  const stories = facts.plutoCharacteristics?.numFloors ?? null;
  const blockLastDigit = taxBlockLastDigit(facts.bbl);
  const window = blockLastDigit === null ? null : fispWindow(blockLastDigit, asOf);

  const onRecord = facadeFilingOnRecord(facts, window);
  const windowOpen =
    window !== null &&
    asOf.getTime() >= window.opens.getTime() &&
    asOf.getTime() < window.closes.getTime();

  let status: ComplianceStatus;
  if (window === null) {
    status = "unknown";
  } else if (onRecord === true) {
    status = "satisfied";
  } else if (windowOpen) {
    status = onRecord === false ? "due" : "unknown";
  } else {
    status = nearOrPast(window.closes, asOf) ? "due" : "unknown";
  }

  return {
    lawId: "ll11",
    title: "Facade inspection and safety report (FISP)",
    dueDate: window === null ? null : toIso(window.closes),
    cycle:
      window === null
        ? "5-year cycle; sub-cycle window set by tax block (block undetermined)"
        : `5-year cycle, sub-cycle ${window.label}${stories === null ? "" : ` (${stories} stories)`}; window ${toIso(window.opens)} to ${toIso(window.closes)}`,
    onRecord,
    status,
    action:
      onRecord === true
        ? null
        : window === null
          ? "Determine this building's FISP sub-cycle window (by tax block) and file the facade report with a licensed inspector."
          : `File the facade report with a Qualified Exterior Wall Inspector before the sub-cycle ${window.label} window closes ${toIso(window.closes)}.`,
    basis:
      "LL11 / Admin Code 28-302; sub-cycle windows per 1 RCNY 103-04 and the DOB Cycle 10 facade service notice (blocks 4/5/6/9 from Feb 2025, 0/7/8 from Feb 2026, 1/2/3 from Feb 2027)",
  };
}

// Whether a real FISP report is on record for the cycle the window belongs to.
// DOB auto-generates "No Report Filed" placeholder rows for unfiled windows, so
// those count as evidence of non-filing. Null when the dataset gave no answer.
function facadeFilingOnRecord(
  facts: BuildingFacts,
  window: FispWindow | null,
): boolean | null {
  const filings = facts.facadeFilings ?? null;
  if (filings === null || window === null) {
    return null;
  }

  // The cycle number this window belongs to: cycle 10 windows open 2025-2027,
  // and each later cycle shifts the open year by five.
  const subcycle = FISP_SUBCYCLES.find(entry => entry.label === window.label);
  const cycleNumber =
    subcycle === undefined
      ? null
      : 10 + (window.opens.getUTCFullYear() - subcycle.cycle10OpenYear) / 5;
  if (cycleNumber === null) {
    return null;
  }

  const cycleFilings = filings.filter(
    filing =>
      filing.cycle !== null && filing.cycle.replace(/\D/g, "") === String(cycleNumber),
  );
  if (cycleFilings.length === 0) {
    return null;
  }

  return cycleFilings.some(
    filing =>
      filing.filingType !== "Auto-Generated" &&
      filing.filingStatus !== null &&
      filing.filingStatus.toLowerCase() !== "no report filed",
  );
}

// The LL152 district-to-year rotation (1 RCNY 103-10). District numbers are
// within-borough (PLUTO's cd is borough*100 + district, so 101 -> district 1).
// The four-year rotation, anchored at the 2024 cycle:
//   2024: districts 1, 3, 10        2025: 2, 5, 7, 13, 18
//   2026: 4, 6, 8, 9, 16            2027: 11, 12, 14, 15, 17
const LL152_ROTATION: number[][] = [
  [1, 3, 10], // years ≡ 2024 (mod 4)
  [2, 5, 7, 13, 18], // years ≡ 2025 (mod 4)
  [4, 6, 8, 9, 16], // years ≡ 2026 (mod 4)
  [11, 12, 14, 15, 17], // years ≡ 2027 (mod 4)
];

// The Dec 31 deadline of the current-or-next LL152 inspection year for a
// district number, as of a date.
function ll152Deadline(districtNumber: number, asOf: Date): Date | null {
  const offset = LL152_ROTATION.findIndex(group => group.includes(districtNumber));
  if (offset === -1) {
    return null;
  }

  let year = asOf.getUTCFullYear();
  while ((year - 2024 - offset) % 4 !== 0) {
    year++;
  }
  let deadline = new Date(Date.UTC(year, 11, 31));
  if (deadline.getTime() < asOf.getTime()) {
    deadline = new Date(Date.UTC(year + 4, 11, 31));
  }
  return deadline;
}

// LL152 — periodic gas-piping inspection and certification on a community-
// district cycle of four years (1 RCNY 103-10). No public dataset confirms a
// certification is on file, so onRecord stays null.
export function ll152FilingStatus(facts: BuildingFacts, asOf: Date): FilingStatus {
  const cd = facts.plutoCharacteristics?.communityDistrict ?? null;
  const districtNumber = cd === null ? null : cd % 100;
  const deadline = districtNumber === null ? null : ll152Deadline(districtNumber, asOf);

  const status: ComplianceStatus = nearOrPast(deadline, asOf) ? "due" : "unknown";

  return {
    lawId: "ll152",
    title: "Gas piping inspection and certification",
    dueDate: deadline === null ? null : toIso(deadline),
    cycle:
      districtNumber === null
        ? "4-year certification cycle by community district (district unknown)"
        : `4-year certification cycle; community district ${districtNumber} files in ${deadline?.getUTCFullYear() ?? "an unmapped year"}`,
    onRecord: null,
    status,
    action:
      deadline === null
        ? "Look up this community district's LL152 filing year and have a licensed master plumber certify the gas piping."
        : `Have a licensed master plumber inspect the gas piping and file the certification by ${toIso(deadline)}.`,
    basis:
      "LL152 / Admin Code 28-318; district years per 1 RCNY 103-10 (2024: CD 1/3/10; 2025: CD 2/5/7/13/18; 2026: CD 4/6/8/9/16; 2027: CD 11/12/14/15/17, repeating every 4 years). No public dataset confirms filings",
  };
}

// LL55 — indoor allergen hazards (mold and pests). An annual duty on owners of
// buildings with three or more residential units: inspect every unit, remediate
// findings, and give tenants the required notice with the lease. There is no
// DOB filing; enforcement is HPD violations, whose classes vary too widely to
// price honestly.
export function ll55FilingStatus(facts: BuildingFacts, _asOf: Date): FilingStatus {
  const units = facts.plutoCharacteristics?.unitsResidential ?? null;

  return {
    lawId: "ll55",
    title: "Annual indoor allergen inspection (mold and pests)",
    dueDate: null,
    cycle:
      units === null
        ? "Annual inspection of every residential unit (unit count unknown)"
        : `Annual inspection of all ${units.toLocaleString("en-US")} residential units`,
    onRecord: null,
    status: "unknown",
    action:
      "Inspect every unit for mold and pest conditions annually, remediate findings " +
      "using the safe-work practices of 24 RCNY chapter 18, and provide the allergen " +
      "notice with each lease.",
    basis:
      "LL55 of 2018 / Housing Maintenance Code 27-2017 et seq.; applies to buildings " +
      "with 3+ residential units. No filing exists, so compliance cannot be confirmed " +
      "from city data",
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

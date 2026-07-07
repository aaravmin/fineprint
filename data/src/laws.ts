// Law registry: which NYC laws bind a building, when the next statutory
// deadline falls, and the rough annual exposure if nothing is done. This is the
// canonical source (data/laws.ts only re-exports it); the data layer's richer
// filing-status logic in data/src/filings.ts mirrors the same cycle rules with
// real DOB datasets layered on. Fine formulas are rough estimates from public
// disclosure data — see README honesty footnote.

// Everything an applicability or deadline rule may look at. sqft and
// isAffordable are always known; the rest come from PLUTO and the LL84
// disclosure when intake resolved them, and are left undefined otherwise. Rules
// use the real characteristic when present and fall back to a floor-area proxy
// only when it is missing, never the other way around.
export interface BuildingProfile {
  sqft: number;
  isAffordable: boolean;
  // PLUTO numfloors — the honest LL11/FISP trigger (height, not floor area).
  numFloors?: number;
  // PLUTO unitsres — the honest LL55 trigger (residential occupancy).
  unitsResidential?: number;
  // PLUTO cd (borough*100 + district) — schedules the LL152 gas cycle.
  communityDistrict?: number;
  // 10-digit BBL — its tax block schedules the LL87 and LL11 cycles.
  bbl?: string;
  // PLUTO bldgclass — class "M" is a house of worship, exempt from LL97.
  buildingClass?: string;
  // Combined floor area of every building on the tax lot; LL97 also covers a
  // lot whose buildings together clear 50,000 sqft.
  lotAggregateSqft?: number;
  // Whether gas service is present (LL152). Defaults to true: the buildings
  // that reach intake are not the 1-2 family homes the exemption is for.
  hasGasService?: boolean;
  // ENERGY STAR score backing the LL33 letter grade.
  energyStarScore?: number;
}

export interface Law {
  id: string;
  name: string;
  short: string;
  kind: string;
  // Bumped whenever a rule changes; effectiveDate dates that version so a stored
  // figure can be traced to the rule that produced it. NYC tightens these yearly
  // (the 2030 LL97 caps are already on the books), so the registry is versioned.
  version: number;
  effectiveDate: string; // ISO date this rule version took effect
  // Plain-language statement of the filing cycle, shown to owners.
  cadence: string;
  appliesTo: (profile: BuildingProfile) => boolean;
  // The next statutory deadline as of `asOf`, or null when it can't be dated
  // from what's known (or the law carries no deadline, e.g. PACE financing).
  nextDeadline: (asOf: Date, profile: BuildingProfile) => Date | null;
  // Rough annual exposure in USD if the building does nothing. null = no
  // monetary penalty modeled (a performance pathway, or a variable regime).
  penaltyUsd: (profile: BuildingProfile) => number | null;
}

// The whole registry's version: bump when any law's rule set changes so callers
// can record which registry produced a stored figure.
export const LAW_REGISTRY_VERSION = 2;

const MS_PER_DAY = 86_400_000;

// The tax block is digits 2-6 of a 10-digit BBL (1 borough + 5 block + 4 lot).
function taxBlockLastDigit(bbl: string | undefined): number | null {
  if (bbl === undefined) {
    return null;
  }
  const digits = bbl.replace(/\D/g, "");
  if (digits.length !== 10) {
    return null;
  }
  return Number(digits[5]);
}

// The next occurrence of month/day on or after asOf (months are 1-based here).
function nextAnnualDeadline(asOf: Date, month: number, day: number): Date {
  const thisYear = new Date(Date.UTC(asOf.getUTCFullYear(), month - 1, day));
  if (thisYear.getTime() >= asOf.getTime()) {
    return thisYear;
  }
  return new Date(Date.UTC(asOf.getUTCFullYear() + 1, month - 1, day));
}

// LL87 runs on a 10-year cycle whose compliance year ends in the building's
// tax-block last digit: the next Dec 31 of such a year, on or after asOf.
function ll87Deadline(asOf: Date, profile: BuildingProfile): Date | null {
  const lastDigit = taxBlockLastDigit(profile.bbl);
  if (lastDigit === null) {
    return null;
  }
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

// FISP sub-cycle windows (1 RCNY 103-04), keyed by tax-block last digit. The
// Cycle 10 windows below recur every five years; we return the close date of
// the current-or-next window. Mirrors data/src/filings.ts.
const FISP_SUBCYCLES: Array<{ digits: number[]; cycle10OpenYear: number }> = [
  { digits: [4, 5, 6, 9], cycle10OpenYear: 2025 },
  { digits: [0, 7, 8], cycle10OpenYear: 2026 },
  { digits: [1, 2, 3], cycle10OpenYear: 2027 },
];

function ll11Deadline(asOf: Date, profile: BuildingProfile): Date | null {
  const lastDigit = taxBlockLastDigit(profile.bbl);
  if (lastDigit === null) {
    return null;
  }
  const subcycle = FISP_SUBCYCLES.find(entry => entry.digits.includes(lastDigit));
  if (!subcycle) {
    return null;
  }
  let openYear = subcycle.cycle10OpenYear;
  while (new Date(Date.UTC(openYear + 2, 1, 21)).getTime() < asOf.getTime()) {
    openYear += 5;
  }
  return new Date(Date.UTC(openYear + 2, 1, 21));
}

// LL152 gas-piping cycle (1 RCNY 103-10): a four-year rotation by community
// district, anchored at 2024. District numbers are within-borough (PLUTO's cd
// is borough*100 + district). Mirrors data/src/filings.ts.
const LL152_ROTATION: number[][] = [
  [1, 3, 10], // years ≡ 2024 (mod 4)
  [2, 5, 7, 13, 18], // years ≡ 2025 (mod 4)
  [4, 6, 8, 9, 16], // years ≡ 2026 (mod 4)
  [11, 12, 14, 15, 17], // years ≡ 2027 (mod 4)
];

function ll152Deadline(asOf: Date, profile: BuildingProfile): Date | null {
  if (profile.communityDistrict === undefined) {
    return null;
  }
  const districtNumber = profile.communityDistrict % 100;
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

// LL97 covers a building over 25,000 sqft, or a tax lot whose buildings together
// clear 50,000 sqft. Houses of worship (PLUTO class M) are exempt.
function isLl97Covered(profile: BuildingProfile): boolean {
  if (profile.buildingClass?.toUpperCase().startsWith("M")) {
    return false;
  }
  return profile.sqft >= 25_000 || (profile.lotAggregateSqft ?? 0) >= 50_000;
}

export const LAWS: Law[] = [
  {
    id: "ll97",
    name: "LL97 — Building Emissions Cap",
    short: "LL97",
    kind: "emissions_fine_analysis",
    version: 2,
    effectiveDate: "2024-01-01", // first compliance period
    cadence: "Annual emissions report due May 1 for the prior calendar year",
    appliesTo: profile => isLl97Covered(profile) && !profile.isAffordable,
    nextDeadline: asOf => nextAnnualDeadline(asOf, 5, 1),
    // The engine computes the real per-building fine from actual emissions and
    // passes it in at intake. Without emissions there is no honest way to guess a
    // fine, so absent that input this carries no figure (null) rather than a
    // fabricated stub — matching the building row, which stores null.
    penaltyUsd: () => null,
  },
  {
    id: "art321",
    name: "LL97 Article 321 — Affordable Housing Pathway",
    short: "Art 321",
    kind: "prescriptive_measures_plan",
    version: 2,
    // Rent-regulated buildings (35%+ regulated units) begin compliance in 2026.
    effectiveDate: "2026-01-01",
    cadence: "Comply via prescribed measures or the 2030 emissions limit",
    appliesTo: profile => isLl97Covered(profile) && profile.isAffordable,
    nextDeadline: asOf => nextAnnualDeadline(asOf, 5, 1),
    penaltyUsd: () => null,
  },
  {
    id: "ll84",
    name: "LL84 — Energy & Water Benchmarking",
    short: "LL84",
    kind: "benchmarking_filing",
    version: 1,
    effectiveDate: "2010-01-01",
    cadence: "Annual, due May 1 for the prior calendar year",
    appliesTo: profile => profile.sqft >= 25_000,
    nextDeadline: asOf => nextAnnualDeadline(asOf, 5, 1),
    // $500 per quarter not benchmarked, to an annual maximum of $2,000. This is
    // the worst-case yearly exposure (all four quarters missed), not an amount
    // currently owed; it is flat and does not scale with building size.
    penaltyUsd: () => 2_000,
  },
  {
    id: "ll87",
    name: "LL87 — Energy Audit & Retro-commissioning",
    short: "LL87",
    kind: "audit_filing",
    version: 1,
    effectiveDate: "2013-01-01",
    cadence:
      "ASHRAE Level II audit + retro-commissioning once per 10-year cycle, by tax-block year",
    appliesTo: profile => profile.sqft >= 50_000,
    nextDeadline: ll87Deadline,
    // No statute sets a floor-area civil penalty for a late audit, and the
    // audit's own cost varies by building. Any per-sqft figure here would be
    // invented, so no monetary exposure is modeled (null), as with LL55.
    penaltyUsd: () => null,
  },
  {
    id: "ll11",
    name: "LL11 / FISP — Facade Inspection",
    short: "LL11",
    kind: "facade_inspection",
    version: 1,
    effectiveDate: "1998-01-01",
    cadence: "5-year FISP cycle; 2-year filing window set by tax block",
    // FISP turns on building height (over six stories), not floor area. Use
    // PLUTO's story count when known; fall back to the sqft proxy otherwise.
    appliesTo: profile =>
      profile.numFloors !== undefined ? profile.numFloors > 6 : profile.sqft >= 60_000,
    nextDeadline: ll11Deadline,
    // FISP civil penalties turn on filing lateness and unsafe-condition findings,
    // not floor area, and vary case by case. A per-sqft figure here would be
    // invented, so no monetary exposure is modeled (null), as with LL55.
    penaltyUsd: () => null,
  },
  {
    id: "ll88",
    name: "LL88 — Lighting Upgrades & Submetering",
    short: "LL88",
    kind: "lighting_submetering_plan",
    version: 2,
    effectiveDate: "2025-01-01",
    cadence: "One-time upgrade (deadline Jan 1, 2025); report due May 1, 2025",
    appliesTo: profile => profile.sqft >= 25_000,
    nextDeadline: () => new Date(Date.UTC(2025, 0, 1)),
    // The statute's penalty is $500 per covered tenant space over 5,000 sqft left
    // unsubmetered — a count we don't have without a tenant-space inventory. Any
    // floor-area proxy would be invented, so no monetary exposure is modeled
    // (null), as with LL55.
    penaltyUsd: () => null,
  },
  {
    id: "ll33",
    name: "LL33 — Building Energy Grade",
    short: "LL33",
    kind: "energy_grade_posting",
    version: 1,
    effectiveDate: "2020-01-01",
    cadence: "Annual — post the energy label (A-F) near every public entrance",
    // LL33 grades ride on the LL84 benchmarking score, so the same 25,000 sqft
    // floor applies.
    appliesTo: profile => profile.sqft >= 25_000,
    nextDeadline: asOf => nextAnnualDeadline(asOf, 10, 31),
    // $1,250 civil penalty for failure to post the required grade — flat per
    // statute, the same for every building.
    penaltyUsd: () => 1_250,
  },
  {
    id: "ll152",
    name: "LL152 — Gas Piping Inspection & Certification",
    short: "LL152",
    kind: "gas_piping_certification",
    version: 1,
    effectiveDate: "2016-01-01",
    cadence: "4-year certification cycle by community district",
    // Gas service is assumed present until a DOB gas dataset lands (1-2 family
    // homes are exempt, but they never reach our intake in the first place).
    appliesTo: profile => profile.hasGasService ?? true,
    nextDeadline: ll152Deadline,
    // $10,000 failure-to-certify civil penalty — flat per statute, the same for
    // every building.
    penaltyUsd: () => 10_000,
  },
  {
    id: "ll96",
    name: "LL96 — PACE Clean Energy Financing",
    short: "LL96",
    kind: "pace_financing",
    version: 1,
    effectiveDate: "2019-01-01",
    cadence: "Optional financing — no deadline; available to fund efficiency retrofits",
    // PACE is an enabling financing pathway, not an obligation: any covered
    // building can use it to fund the retrofits that LL97 and LL87 call for. It
    // carries no deadline and no penalty, so it is surfaced as an opportunity
    // rather than spawned as a task.
    appliesTo: profile => profile.sqft >= 25_000,
    nextDeadline: () => null,
    penaltyUsd: () => null,
  },
  {
    id: "ll55",
    name: "LL55 — Indoor Allergen Hazards (Mold & Pests)",
    short: "LL55",
    kind: "mold_pest_remediation",
    version: 1,
    effectiveDate: "2019-01-01",
    cadence: "Annual — inspect every residential unit for mold and pests",
    // Residential occupancy is the trigger: three or more residential units.
    // PLUTO's unit count is the honest signal; the affordable flag is the
    // fallback proxy when PLUTO is silent.
    appliesTo: profile =>
      profile.unitsResidential !== undefined
        ? profile.unitsResidential >= 3
        : profile.isAffordable,
    nextDeadline: () => null, // HPD allergen duty is ongoing, with no filing date
    penaltyUsd: () => null, // HPD violation classes vary too widely to stub honestly
  },
];

// Laws that place a datable, penalized obligation on the building — the ones the
// module spawns as tasks. PACE financing (an opportunity) is excluded.
export function applicableLaws(profile: BuildingProfile): Law[] {
  return LAWS.filter(law => law.appliesTo(profile) && law.kind !== "pace_financing");
}

export function lawById(id: string): Law | undefined {
  return LAWS.find(law => law.id === id);
}

// Days between asOf and a deadline (negative once the deadline has passed).
export function daysUntil(deadline: Date, asOf: Date): number {
  return (deadline.getTime() - asOf.getTime()) / MS_PER_DAY;
}

// The LL33 letter grade for an ENERGY STAR score. Statutory bands
// (Admin Code 28-309.12.2): A 85+, B 70-84, C 55-69, D under 55. A filed score
// never grades below D — the F grade is reserved for buildings that failed to
// submit required benchmarking, which is a filing signal, not a low score. A
// building with no score (not ENERGY STAR eligible) posts an "N"; pass null for it.
export function energyGradeForScore(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return "N";
  }
  if (score >= 85) {
    return "A";
  }
  if (score >= 70) {
    return "B";
  }
  if (score >= 55) {
    return "C";
  }
  return "D";
}

// Law registry: how Local Law 97 binds a building, when the next statutory
// deadline falls, and the rough annual exposure if nothing is done. This is the
// canonical source, consumed by the data layer, the client (via the
// `fineprint-laws` tsconfig alias), and the Trigger.dev intake job. Fine
// formulas are rough estimates from public disclosure data - the engine's
// per-building number overrides them at intake.
//
// The product models LL97 only, split across its two fine bases: Article 320
// (the per-ton emissions penalty) and Article 321 (the affordable-housing
// prescriptive pathway).

// Everything an applicability or deadline rule may look at. sqft and
// isAffordable are always known; the rest come from PLUTO and the energy
// benchmarking disclosure when intake resolved them, and are left undefined
// otherwise. Rules use the real characteristic when present and fall back to a
// floor-area proxy only when it is missing, never the other way around.
export interface BuildingProfile {
  sqft: number;
  isAffordable: boolean;
  numFloors?: number;
  unitsResidential?: number;
  communityDistrict?: number;
  // 10-digit BBL - the parcel identifier intake resolves the building to.
  bbl?: string;
  // PLUTO bldgclass — class "M" is a house of worship, exempt from LL97.
  buildingClass?: string;
  // Combined floor area of every building on the tax lot; LL97 also covers a
  // lot whose buildings together clear 50,000 sqft.
  lotAggregateSqft?: number;
  hasGasService?: boolean;
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
  // from what's known.
  nextDeadline: (asOf: Date, profile: BuildingProfile) => Date | null;
  // Rough annual exposure in USD if the building does nothing. null = no
  // monetary penalty modeled (a performance pathway, or a variable regime).
  penaltyUsd: (profile: BuildingProfile) => number | null;
}

// The whole registry's version: bump when any law's rule set changes so callers
// can record which registry produced a stored figure.
export const LAW_REGISTRY_VERSION = 2;

const MS_PER_DAY = 86_400_000;

// The next occurrence of month/day on or after asOf (months are 1-based here).
function nextAnnualDeadline(asOf: Date, month: number, day: number): Date {
  const thisYear = new Date(Date.UTC(asOf.getUTCFullYear(), month - 1, day));
  if (thisYear.getTime() >= asOf.getTime()) {
    return thisYear;
  }
  return new Date(Date.UTC(asOf.getUTCFullYear() + 1, month - 1, day));
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
    // $268 per tCO2e over cap; stub assumes an office-like overage of ~0.5
    // kgCO2e/sqft. The engine's real per-building fine overrides this at intake.
    penaltyUsd: profile => Math.round(profile.sqft * 0.0005 * 268),
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
];

// Laws that place a datable, penalized obligation on the building — the ones the
// intake spawns as tasks.
export function applicableLaws(profile: BuildingProfile): Law[] {
  return LAWS.filter(law => law.appliesTo(profile));
}

export function lawById(id: string): Law | undefined {
  return LAWS.find(law => law.id === id);
}

// Days between asOf and a deadline (negative once the deadline has passed).
export function daysUntil(deadline: Date, asOf: Date): number {
  return (deadline.getTime() - asOf.getTime()) / MS_PER_DAY;
}

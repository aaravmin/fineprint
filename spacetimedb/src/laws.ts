// Law registry: which NYC laws apply to a building, deadline horizon, fine stub.
// Fine formulas are rough estimates from public disclosure data — see README honesty footnote.

export interface Law {
  id: string;
  name: string;
  kind: string;
  // Days from intake until the next statutory deadline (stub; P1 replaces with real cycle dates).
  deadlineDays: number;
  appliesTo: (sqft: number, isAffordable: boolean) => boolean;
  // Rough annual exposure in USD if the building does nothing. null = no monetary fine modeled.
  fineEstimateUsd: (sqft: number, isAffordable: boolean) => number | null;
}

export const LAWS: Law[] = [
  {
    id: "ll97",
    name: "LL97 — Building Emissions Cap",
    kind: "emissions_fine_analysis",
    deadlineDays: 120,
    appliesTo: (sqft, isAffordable) => sqft >= 25_000 && !isAffordable,
    // $268 per tCO2e over cap; stub: assume office-like intensity overage of ~0.5 kgCO2e/sqft.
    fineEstimateUsd: sqft => Math.round(sqft * 0.0005 * 268),
  },
  {
    id: "art321",
    name: "LL97 Article 321 — Affordable Housing Pathway",
    kind: "prescriptive_measures_plan",
    deadlineDays: 180,
    appliesTo: (sqft, isAffordable) => sqft >= 25_000 && isAffordable,
    fineEstimateUsd: () => null,
  },
  {
    id: "ll84",
    name: "LL84 — Energy & Water Benchmarking",
    kind: "benchmarking_filing",
    deadlineDays: 45,
    appliesTo: sqft => sqft >= 25_000,
    fineEstimateUsd: () => 2_500, // quarterly $500 violations, annualized stub
  },
  {
    id: "ll87",
    name: "LL87 — Energy Audit & Retro-commissioning",
    kind: "audit_filing",
    deadlineDays: 240,
    appliesTo: sqft => sqft >= 50_000,
    fineEstimateUsd: () => 3_000,
  },
  {
    id: "ll11",
    name: "LL11 / FISP — Facade Inspection",
    kind: "facade_inspection",
    deadlineDays: 90,
    // Stories not tracked yet; sqft is a stand-in for "over six stories" (P1: real DOB data).
    appliesTo: sqft => sqft >= 60_000,
    fineEstimateUsd: () => 5_000, // failure-to-file civil penalties, annualized stub
  },
  {
    id: "ll88",
    name: "LL88 — Lighting Upgrades & Submetering",
    kind: "lighting_submetering_plan",
    deadlineDays: 300,
    appliesTo: sqft => sqft >= 25_000,
    fineEstimateUsd: () => 1_500,
  },
];

export function applicableLaws(sqft: number, isAffordable: boolean): Law[] {
  return LAWS.filter(law => law.appliesTo(sqft, isAffordable));
}

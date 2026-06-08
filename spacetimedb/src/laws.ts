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
    // $500 per quarter not benchmarked, capped at $2,000/yr — a flat statutory
    // penalty that does not scale with building size.
    fineEstimateUsd: () => 2_000,
  },
  {
    id: "ll87",
    name: "LL87 — Energy Audit & Retro-commissioning",
    kind: "audit_filing",
    deadlineDays: 240,
    appliesTo: sqft => sqft >= 50_000,
    // Audit and retro-commissioning scope scales with the systems audited, i.e.
    // floor area. Rate is anchored so a building at the 50k applicability
    // threshold sees ~$3,000 and exposure grows from there.
    fineEstimateUsd: sqft => Math.max(3_000, Math.round(sqft * 0.06)),
  },
  {
    id: "ll11",
    name: "LL11 / FISP — Facade Inspection",
    kind: "facade_inspection",
    deadlineDays: 90,
    // Stories not tracked yet; sqft is a stand-in for "over six stories" (P1: real DOB data).
    appliesTo: sqft => sqft >= 60_000,
    // Facade inspection scope and unsafe-condition penalty risk grow with the
    // building's envelope; sqft is the available proxy. Rate is anchored so a
    // building at the 60k applicability threshold sees ~$5,000 and grows up.
    fineEstimateUsd: sqft => Math.max(5_000, Math.round(sqft * 0.083)),
  },
  {
    id: "ll88",
    name: "LL88 — Lighting Upgrades & Submetering",
    kind: "lighting_submetering_plan",
    deadlineDays: 300,
    appliesTo: sqft => sqft >= 25_000,
    // Lighting upgrade and tenant-submetering scope scale with floor area. Rate
    // is anchored so a building at the 25k applicability threshold sees ~$1,500
    // and exposure grows from there.
    fineEstimateUsd: sqft => Math.max(1_500, Math.round(sqft * 0.06)),
  },
  {
    id: "ll152",
    name: "LL152 — Gas Piping Inspection & Certification",
    kind: "gas_piping_certification",
    deadlineDays: 150, // community-district cycle stub; P1 maps the CD to its filing year
    // Gas service assumed present until DOB data lands (1-2 family homes are
    // exempt, but they never reach our intake in the first place).
    appliesTo: () => true,
    // $10,000 failure-to-certify civil penalty — flat per statute, the same for
    // every building.
    fineEstimateUsd: () => 10_000,
  },
  {
    id: "ll55",
    name: "LL55 — Indoor Allergen Hazards (Mold & Pests)",
    kind: "mold_pest_remediation",
    deadlineDays: 60,
    // Residential proxy until unit counts land (P1); our affordable flag is
    // the only residential signal the registry has today.
    appliesTo: (_sqft, isAffordable) => isAffordable,
    fineEstimateUsd: () => null, // HPD violation classes vary too widely to stub honestly
  },
];

export function applicableLaws(sqft: number, isAffordable: boolean): Law[] {
  return LAWS.filter(law => law.appliesTo(sqft, isAffordable));
}

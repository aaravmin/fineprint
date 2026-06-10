// The canonical law registry for the dashboard. One object per supported NYC
// law, keyed by the same law_id the module spawns on tasks (task.lawId) and that
// the canonical module registry in spacetimedb/src/laws.ts defines. The module
// registry owns the runtime logic (applicability, deadlines, penalties); this
// one owns how a law is named and surfaced in the UI. They are joined by law_id,
// and scripts/audit-law-dashboard.ts checks that the id and short-code sets stay
// in lockstep so a law is never named two different ways across the app.
//
// Every component that lists, labels, filters, or renders a law reads from here
// — there is no second hardcoded list of law names.

export interface LawRegistryEntry {
  law_id: string;
  slug: string;
  display_name: string;
  short_name: string;
  jurisdiction: string;
  category: string;
  description: string;
  // Human statement of who the law binds; the executable test lives in the
  // module registry and the data-layer analyzers.
  applies_to_logic: string;
  // Stable key for this law's dashboard output (one law_id per output).
  dashboard_output_key: string;
  // Building fields the law's status/exposure reads from (Building binding).
  source_data_keys: string[];
  enabled: boolean;
  sort_order: number;
}

export const LAW_REGISTRY: LawRegistryEntry[] = [
  {
    law_id: "ll97",
    slug: "local-law-97",
    display_name: "Building Emissions Cap",
    short_name: "LL97",
    jurisdiction: "NYC",
    category: "Emissions cap",
    description:
      "Annual carbon-emissions limits for large buildings, with a $268/tCO2e penalty on the overage.",
    applies_to_logic:
      "Buildings over 25,000 ft² (or a tax lot whose buildings total over 50,000 ft²), excluding the affordable-housing Article 321 pathway and houses of worship.",
    dashboard_output_key: "law-card:ll97",
    source_data_keys: ["sqft", "annualEmissionsTco2E", "usesJson"],
    enabled: true,
    sort_order: 0,
  },
  {
    law_id: "art321",
    slug: "local-law-97-article-321",
    display_name: "Affordable-Housing Emissions Pathway",
    short_name: "Art 321",
    jurisdiction: "NYC",
    category: "Emissions cap",
    description:
      "LL97's alternative pathway for rent-regulated / affordable housing: prescribed measures or the 2030 emissions limit, with flat penalties rather than $268/tCO2e.",
    applies_to_logic:
      "Covered buildings flagged as affordable / rent-regulated (35%+ regulated units), on a compliance timeline beginning 2026.",
    dashboard_output_key: "law-card:art321",
    source_data_keys: ["sqft", "isAffordable", "annualEmissionsTco2E"],
    enabled: true,
    sort_order: 1,
  },
  {
    law_id: "ll84",
    slug: "local-law-84",
    display_name: "Energy & Water Benchmarking",
    short_name: "LL84",
    jurisdiction: "NYC",
    category: "Benchmarking",
    description:
      "Annual energy and water benchmarking through ENERGY STAR Portfolio Manager, due May 1.",
    applies_to_logic: "Buildings over 25,000 ft².",
    dashboard_output_key: "law-card:ll84",
    source_data_keys: ["sqft"],
    enabled: true,
    sort_order: 2,
  },
  {
    law_id: "ll87",
    slug: "local-law-87",
    display_name: "Energy Audit & Retro-commissioning",
    short_name: "LL87",
    jurisdiction: "NYC",
    category: "Energy audit",
    description:
      "ASHRAE Level II energy audit and retro-commissioning once per 10-year cycle, scheduled by tax block.",
    applies_to_logic: "Buildings over 50,000 ft².",
    dashboard_output_key: "law-card:ll87",
    source_data_keys: ["sqft", "bbl"],
    enabled: true,
    sort_order: 3,
  },
  {
    law_id: "ll11",
    slug: "local-law-11",
    display_name: "Facade Inspection (FISP)",
    short_name: "LL11",
    jurisdiction: "NYC",
    category: "Facade safety",
    description:
      "Periodic facade inspection and safety report (FISP) on a 5-year cycle, by a Qualified Exterior Wall Inspector.",
    applies_to_logic:
      "Buildings over six stories (from PLUTO floor count; a 60,000 ft² floor-area proxy when the count is unknown).",
    dashboard_output_key: "law-card:ll11",
    source_data_keys: ["numFloors", "bbl"],
    enabled: true,
    sort_order: 4,
  },
  {
    law_id: "ll88",
    slug: "local-law-88",
    display_name: "Lighting Upgrades & Submetering",
    short_name: "LL88",
    jurisdiction: "NYC",
    category: "Lighting & submetering",
    description:
      "Lighting upgrades to the NYC Energy Conservation Code and tenant-space submetering.",
    applies_to_logic: "Buildings over 25,000 ft².",
    dashboard_output_key: "law-card:ll88",
    source_data_keys: ["sqft"],
    enabled: true,
    sort_order: 5,
  },
  {
    law_id: "ll33",
    slug: "local-law-33",
    display_name: "Building Energy Grade",
    short_name: "LL33",
    jurisdiction: "NYC",
    category: "Energy grade",
    description:
      "Public A-F energy letter grade (LL33/LL95) derived from the LL84 ENERGY STAR score, posted near every entrance.",
    applies_to_logic: "Buildings over 25,000 ft² (the LL84 benchmarking floor).",
    dashboard_output_key: "law-card:ll33",
    source_data_keys: ["sqft", "energyStarScore"],
    enabled: true,
    sort_order: 6,
  },
  {
    law_id: "ll152",
    slug: "local-law-152",
    display_name: "Gas Piping Inspection & Certification",
    short_name: "LL152",
    jurisdiction: "NYC",
    category: "Gas safety",
    description:
      "Periodic gas-piping inspection and certification by a Licensed Master Plumber, on a 4-year community-district cycle.",
    applies_to_logic:
      "Buildings with gas service (assumed present until a DOB gas dataset lands).",
    dashboard_output_key: "law-card:ll152",
    source_data_keys: ["communityDistrict"],
    enabled: true,
    sort_order: 7,
  },
  {
    law_id: "ll96",
    slug: "local-law-96",
    display_name: "PACE Clean Energy Financing",
    short_name: "LL96",
    jurisdiction: "NYC",
    category: "Clean energy financing",
    description:
      "Property Assessed Clean Energy financing for efficiency and renewable retrofits — an opportunity, not an obligation, so it carries no deadline or penalty.",
    applies_to_logic:
      "Available to covered buildings (over 25,000 ft²) to fund the retrofits LL97 and LL87 call for.",
    dashboard_output_key: "law-card:ll96",
    source_data_keys: ["sqft"],
    enabled: true,
    sort_order: 8,
  },
  {
    law_id: "ll55",
    slug: "local-law-55",
    display_name: "Indoor Allergen Hazards",
    short_name: "LL55",
    jurisdiction: "NYC",
    category: "Healthy housing",
    description:
      "Annual inspection and remediation of mold and pest hazards in residential units, with a tenant allergen notice.",
    applies_to_logic:
      "Buildings with three or more residential units (from PLUTO unit count; the affordable flag as fallback).",
    dashboard_output_key: "law-card:ll55",
    source_data_keys: ["unitsResidential", "isAffordable"],
    enabled: true,
    sort_order: 9,
  },
];

const byId = new Map(LAW_REGISTRY.map(law => [law.law_id, law]));

export function lawById(lawId: string): LawRegistryEntry | undefined {
  return byId.get(lawId);
}

// The display label for a law_id, always from the registry — never a hardcoded
// string. Falls back to the raw id only for a law the registry does not know.
export function lawDisplayName(lawId: string): string {
  return byId.get(lawId)?.display_name ?? lawId;
}

export function lawShortName(lawId: string): string {
  return byId.get(lawId)?.short_name ?? lawId;
}

// Registry laws in display order, optionally only the enabled ones.
export function lawsInOrder(onlyEnabled = true): LawRegistryEntry[] {
  return LAW_REGISTRY.filter(law => !onlyEnabled || law.enabled).sort(
    (a, b) => a.sort_order - b.sort_order,
  );
}

// Evidence checklist per law (Phase 7.6). `required` is proof the law's own
// filing plainly calls for (a filed report, a certification); `recommended` is
// supporting proof an owner should keep but that isn't strictly mandated. When
// the exact required proof is uncertain it is listed as recommended, never
// invented as required.
export interface LawEvidence {
  required: string[];
  recommended: string[];
}

export const LAW_EVIDENCE: Record<string, LawEvidence> = {
  ll97: {
    required: ["LL97 emissions report (BEAM filing)", "LL84 benchmarking data"],
    recommended: [
      "Compliance/penalty calculation",
      "Decarbonization or good-faith-effort plan",
      "Professional review notes",
    ],
  },
  art321: {
    required: ["Article 321 certification of compliance (DOB)"],
    recommended: ["Prescribed-measures documentation (28-321.2.2)", "Emissions calculation vs 2030 limit"],
  },
  ll84: {
    required: ["Benchmarking submission confirmation", "Reported energy and water data"],
    recommended: ["ENERGY STAR Portfolio Manager report", "Filing confirmation receipt"],
  },
  ll87: {
    required: ["Energy efficiency report (EER) filing confirmation", "ASHRAE Level II energy audit report"],
    recommended: ["Retro-commissioning report", "Approved-auditor certification"],
  },
  ll88: {
    required: ["LL88 lighting/submetering compliance filing"],
    recommended: ["Lighting upgrade documentation", "Submetering documentation", "Contractor invoice"],
  },
  ll11: {
    required: ["QEWI facade safety report (FISP) filing confirmation"],
    recommended: ["Inspection photos", "Repair documentation", "Scaffold/sidewalk-shed permits if applicable"],
  },
  ll33: {
    required: ["Photo of the posted energy label near a public entrance"],
    recommended: ["ENERGY STAR score record (from LL84)"],
  },
  ll152: {
    required: ["Gas piping inspection report (GPS1)", "Licensed Master Plumber certification", "DOB submission confirmation"],
    recommended: ["Correction documentation (GPS2) if repairs were required"],
  },
  ll96: {
    // PACE is an opportunity, not an obligation — no proof is mandated.
    required: [],
    recommended: ["PACE financing application", "Lender term sheet"],
  },
  ll55: {
    // No DOB filing exists; enforcement is HPD violations, so nothing is required.
    required: [],
    recommended: ["Annual unit inspection records", "Remediation records", "Tenant allergen notice with lease"],
  },
};

export function evidenceForLaw(lawId: string): LawEvidence {
  return LAW_EVIDENCE[lawId] ?? { required: [], recommended: [] };
}

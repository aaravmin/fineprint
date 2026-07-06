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
    description: "Annual carbon-emissions limits for large buildings, with a $268/tCO2e penalty on the overage.",
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
];

const byId = new Map(LAW_REGISTRY.map((law) => [law.law_id, law]));

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
  return LAW_REGISTRY.filter((law) => !onlyEnabled || law.enabled).sort((a, b) => a.sort_order - b.sort_order);
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
    required: ["LL97 emissions report (BEAM filing)", "Energy benchmarking data (ENERGY STAR Portfolio Manager)"],
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
};

export function evidenceForLaw(lawId: string): LawEvidence {
  return LAW_EVIDENCE[lawId] ?? { required: [], recommended: [] };
}

// Public types for the Fineprint data layer. This is the locked interface —
// the dashboard, the ingest script, and the agents all build against it.
//
// Every fact carries provenance: which dataset said it, so the UI can render
// an honest footnote and an agent can cite its sources. Fields the city has
// no answer for are null, never guessed.

// 10-digit borough-block-lot, the join key across every NYC dataset.
export type Bbl = string;

export interface BblResult {
  bbl: Bbl;
  normalizedAddress: string;
  borough: string;
}

// One use within a building, in the engine's vocabulary: ESPM property type
// names (e.g. "Multifamily Housing"), ready to feed computeFine directly.
export interface UseSplit {
  group: string;
  sqft: number;
}

export interface Ll84Facts {
  bbl: Bbl;
  reportedAddress: string | null;
  grossFloorAreaSqft: number | null;
  occupancyGroups: UseSplit[];
  // As filed: ESPM's location-based GHG, which prices electricity with
  // national eGRID factors rather than the statute's coefficients.
  annualEmissionsTco2e: number | null;
  // Recomputed from the filing's fuel columns with the coefficients of
  // Admin Code 28-320.3.1.1 — the figure DOB's penalty math would use.
  // Null when any consumed fuel lacks a verified coefficient.
  recomputedEmissionsTco2e: number | null;
  // Fuel columns that blocked the recompute (no verified coefficient).
  unpriceableFuels: string[];
  reportingYear: number | null;
  // Uses whose LL84 name is missing from the rule's factor table and was
  // mapped to the nearest listed bucket — an estimate worth disclosing.
  proxiedUses: Array<{ from: string; to: string }>;
  // Uses with no defensible factor at all ("Other", utility plants). They
  // are excluded from occupancyGroups so the engine never prices them.
  unmappedUses: UseSplit[];
}

export interface ProvenanceNote {
  field: string; // which BuildingFacts field this explains
  source: string; // dataset or API name
  detail?: string; // anything a footnote should add ("no LL84 filing found")
}

// The orchestrator's answer: everything Fineprint knows about one building,
// assembled from public data, engine-ready where the data allows it.
export interface BuildingFacts {
  bbl: Bbl;
  address: string;
  grossFloorAreaSqft: number | null;
  occupancyGroups: UseSplit[];
  annualEmissionsTco2e: number | null;
  isLl97Covered: boolean | null;
  isArticle321: boolean | null;
  provenance: ProvenanceNote[];
}

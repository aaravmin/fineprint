export interface ProvenanceNote {
  field: string;
  source: string;
  detail?: string;
}

// One system that drives the building's emissions, read from the persisted
// systems dossier. A minimal, decoupled shape: just what the draft leads with,
// so policies never depend on the data layer's full BuildingSystems type.
export interface SystemDriver {
  system: string;
  headline: string;
  condition: string;
  shareOfEmissions: number | null;
}

// One building-specific measure, read from the persisted compliance plan's
// personalization block. Same decoupling reason as SystemDriver.
export interface MeasureHighlight {
  name: string;
  targetSystem: string;
  capexUsd: number | null;
  estReductionTco2e: number | null;
  why: string;
}

export interface DraftInput {
  title: string;
  kind: string;
  lawId: string;
  address: string;
  sqft: number;
  isAffordable: boolean;
  fineEstimateUsd: number | undefined;
  deadline: Date | undefined;
  // Real-data fields from ingest. Seed buildings leave them empty - every
  // policy must render something sensible either way.
  bbl: string | undefined;
  annualEmissionsTco2e: number | undefined;
  uses: Array<{ group: string; sqft: number }>;
  ll97Covered: boolean | undefined;
  provenance: ProvenanceNote[];
  // The building's emissions drivers and its top personalized measures, parsed
  // from the systemsJson and compliancePlanJson columns. Empty for seed
  // buildings and any row ingested before the systems dossier existed.
  systemDrivers: SystemDriver[];
  measureHighlights: MeasureHighlight[];
}

export type DraftPolicy = (input: DraftInput) => Promise<string> | string;

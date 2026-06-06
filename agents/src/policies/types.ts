export interface ProvenanceNote {
  field: string;
  source: string;
  detail?: string;
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
  // Real-data fields from ingest. Seed buildings leave them empty — every
  // policy must render something sensible either way.
  bbl: string | undefined;
  annualEmissionsTco2e: number | undefined;
  uses: Array<{ group: string; sqft: number }>;
  ll97Covered: boolean | undefined;
  provenance: ProvenanceNote[];
}

export type DraftPolicy = (input: DraftInput) => Promise<string> | string;

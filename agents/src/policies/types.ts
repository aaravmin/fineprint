export interface DraftInput {
  title: string;
  kind: string;
  lawId: string;
  address: string;
  sqft: number;
  isAffordable: boolean;
  fineEstimateUsd: number | undefined;
  annualEmissionsTco2e: number | undefined;
  usesJson: string | undefined;
  provenanceJson: string | undefined;
}

export type DraftPolicy = (input: DraftInput) => Promise<string> | string;

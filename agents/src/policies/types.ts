export interface DraftInput {
  title: string;
  kind: string;
  lawId: string;
  address: string;
  sqft: number;
  isAffordable: boolean;
  fineEstimateUsd: number | undefined;
}

export type DraftPolicy = (input: DraftInput) => Promise<string> | string;

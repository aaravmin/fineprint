// Projection model for the LL97 Article 321 affordable-housing pathway. The
// Article 320 fine has its own emissions engine; Article 321 is satisfied by
// completing prescribed measures (or holding under the 2030 limit) and filing a
// certification, so the honest "projection" is how the flat statutory penalty
// accrues the longer the obligation goes unmet, and the "plan" is the filing
// that stops it. Penalty figures are the public statutory amounts, not quotes.

export interface AccrualPoint {
  label: string; // e.g. "1 quarter late"
  cumulativeUsd: number; // total penalty owed by this point if still unmet
}

export interface LawProjection {
  cadence: string; // human cycle, e.g. "Annual — due May 1"
  basis: string; // statutory citation for the penalty
  // Cumulative penalty if the obligation stays unmet, across the horizon.
  // Empty when the penalty regime is too variable to state honestly.
  accrual: AccrualPoint[];
  // The actionable filing plan: the concrete steps that satisfy the law.
  steps: string[];
  // Shown in place of an accrual chart when penalties can't be projected.
  variableNote?: string;
}

export const LAW_PROJECTIONS: Record<string, LawProjection> = {
  art321: {
    cadence: "One-time pathway — comply by 2030",
    basis: "DOB Article 321 Filing Guide — $10,000 flat non-compliance penalties",
    accrual: [
      { label: "Year 1 unmet", cumulativeUsd: 10_000 },
      { label: "Year 2 unmet", cumulativeUsd: 20_000 },
      { label: "Year 3 unmet", cumulativeUsd: 30_000 },
    ],
    steps: [
      "Confirm the building qualifies for the affordable-housing pathway (rent-regulated, HDFC, or project-based housing).",
      "Implement the prescribed energy conservation measures of Admin Code 28-321.2.2, or hold emissions under the 2030 limit (28-321.2.1).",
      "File the certification of compliance with DOB.",
    ],
  },
};

export function projectionFor(lawId: string): LawProjection | null {
  return LAW_PROJECTIONS[lawId] ?? null;
}

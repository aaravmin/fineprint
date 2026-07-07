// Per-law projection model for the deadline-driven filing laws. LL97 has its
// own emissions engine; these laws are satisfied by a filing or inspection
// before a cycle deadline, so the honest "projection" is how the civil penalty
// accrues the longer the obligation goes unmet, and the "plan" is the filing
// that stops it. Penalty rates are the public statutory figures, not quotes;
// each law names its basis. LL55 carries no flat rate and says so.

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

// Build a steadily accruing series: `count` periods of `perPeriod` dollars.
function accrue(perPeriod: number, count: number, unit: string): AccrualPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const periods = index + 1;
    return {
      label: `${periods} ${unit}${periods > 1 ? "s" : ""} late`,
      cumulativeUsd: perPeriod * periods,
    };
  });
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
  ll84: {
    cadence: "Annual — due May 1",
    basis: "Admin Code 28-309.12.1 — $500 per quarter not benchmarked, up to $2,000/yr",
    accrual: accrue(500, 4, "quarter"),
    steps: [
      "Pull whole-building energy and water data into ENERGY STAR Portfolio Manager.",
      "Run the data-quality checker and confirm every meter is covered.",
      "Submit the benchmarking report to DOB before May 1.",
    ],
  },
  ll87: {
    cadence: "Once per 10-year cycle — by the building's tag year",
    basis: "Admin Code 28-308.5 — civil penalties for a late Energy Efficiency Report",
    accrual: accrue(3_000, 3, "year"),
    steps: [
      "Retain an approved energy auditor and retro-commissioning agent.",
      "Complete the ASHRAE Level II audit and retro-commissioning of base building systems.",
      "File the Energy Efficiency Report (EER) for the building's tag year.",
    ],
  },
  ll11: {
    cadence: "5-year FISP cycle by sub-cycle",
    basis: "1 RCNY 103-04 — ~$1,000/month for a late facade (FISP) report",
    accrual: accrue(1_000, 6, "month"),
    steps: [
      "Retain a Qualified Exterior Wall Inspector (QEWI).",
      "Complete the close-up facade inspection for the current sub-cycle.",
      "File the FISP report; repair any unsafe conditions and file the amended report.",
    ],
  },
  ll88: {
    cadence: "One-time upgrade — deadline passed Jan 1, 2025",
    basis: "Admin Code 28-310 / 28-311 — penalties for missing lighting and submetering",
    accrual: accrue(1_500, 3, "year"),
    steps: [
      "Upgrade all covered lighting to meet the current NYC Energy Conservation Code.",
      "Install tenant-space submetering and provide monthly usage statements.",
      "File the certification of compliance with DOB.",
    ],
  },
  ll33: {
    cadence: "Annual — post the energy efficiency label (A-F) near every public entrance",
    basis: "LL33 of 2018 (amended by LL95) / Admin Code 28-309.12.2 — $1,250 for failure to post the grade",
    accrual: [
      { label: "Label not posted", cumulativeUsd: 1_250 },
      { label: "+ continued non-posting", cumulativeUsd: 2_500 },
    ],
    steps: [
      "Confirm the building's ENERGY STAR score from the LL84 benchmarking submission.",
      'Generate the DOB energy efficiency label (letter grade A-F and numeric score) at 8.5" x 11".',
      "Post it within 30 days of issuance near every public entrance, and refresh it each year.",
    ],
  },
  ll96: {
    cadence: "Optional financing — no deadline",
    basis: "LL96 of 2019 — Property Assessed Clean Energy (PACE) financing for energy and water improvements",
    accrual: [],
    variableNote:
      "PACE is a financing pathway, not a penalty: it funds the energy retrofits LL97 and LL87 " +
      "call for with no upfront capital, repaid as a charge on the property tax bill over 20-30 " +
      "years (and the balance transfers with the building on sale). There is no deadline and no " +
      "fine — it is an option for closing the LL97 gap, surfaced here so it is not overlooked.",
    steps: [
      "Confirm the planned work is PACE-eligible (energy efficiency, renewables, or resiliency).",
      "Engage an approved PACE lender through the NYC Accelerator / NYCEEC program.",
      "Finance the LL97 / LL87 retrofit through PACE and repay via the property tax assessment.",
    ],
  },
  ll152: {
    cadence: "4-year cycle by community district",
    basis: "Admin Code 28-318.3 — $10,000 civil penalty for failure to certify",
    accrual: [
      { label: "Cycle missed", cumulativeUsd: 10_000 },
      { label: "+ continued non-filing", cumulativeUsd: 15_000 },
    ],
    steps: [
      "Retain a Licensed Master Plumber (LMP) to inspect the exposed gas piping.",
      "File the GPS1 inspection certification within 60 days of the inspection.",
      "Complete any required repairs and file the GPS2 certification within the cure period.",
    ],
  },
  ll55: {
    cadence: "Ongoing — landlord duty, inspect annually",
    basis: "HPD allergen-hazard violation classes (Class B/C) — penalties vary by violation",
    accrual: [],
    variableNote:
      "LL55 penalties are HPD violation-class civil penalties that vary by the number and class of violations, so no flat annual figure can be projected honestly. The obligation is tracked and the plan still applies.",
    steps: [
      "Inspect every dwelling unit annually for mold and pest infestation.",
      "Remediate using integrated pest management and safe work practices; keep records.",
      "Provide tenants the required annual allergen notice and respond to complaints within the statutory window.",
    ],
  },
};

export function projectionFor(lawId: string): LawProjection | null {
  return LAW_PROJECTIONS[lawId] ?? null;
}

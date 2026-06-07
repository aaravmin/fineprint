// The obligation model: every NYC law a building is subject to reduces to one
// or more obligations of exactly two kinds.
//
// A procedural obligation is satisfied by filing or inspecting before a
// deadline. The cost is fixed and the only real question is whether the filing
// is on record. A performance obligation is satisfied by holding emissions
// under a cap, where the remedy is physical measures with a genuine
// cost/impact tradeoff.
//
// Keeping the two apart is what lets the optimizer reason about the whole
// building at once instead of law by law: every performance obligation shares
// one measure plan (a heat pump bought once is credited against every law it
// helps), while procedural obligations are a dated checklist beside it. Laws
// become thin declarations here; the shared math lives in the engine.

import { computeAllPeriods, type FineResult } from "../../engine/src/index.ts";
import { LAWS } from "../laws.ts";
import { toEngineInput } from "./engineBridge.ts";
import type { BuildingFacts } from "./types.ts";

// Where the building stands on one obligation. "at_risk" means a penalty is
// accruing now; "due" means action is needed before a future deadline or cap;
// "unknown" means the city's data can't tell us, and we say so rather than
// guess.
export type ComplianceStatus = "satisfied" | "due" | "at_risk" | "unknown";

interface ObligationBase {
  lawId: string;
  lawName: string;
  title: string;
  status: ComplianceStatus;
  // Building-specific observations, each phrased so narration can quote it.
  findings: string[];
  // Concrete next actions. Performance obligations leave the measure-by-measure
  // plan to the optimizer; these are the framing actions around it.
  recommendations: string[];
}

export interface ProceduralObligation extends ObligationBase {
  kind: "procedural";
  // Civil penalty if the deadline is missed. Null when the penalty regime is
  // too variable to state honestly (e.g. HPD allergen violation classes).
  penaltyUsd: number | null;
}

export interface PerformanceObligation extends ObligationBase {
  kind: "performance";
  // The engine's per-period standing — the single source for every emissions
  // and dollar figure. The optimizer and the narration both read from here so
  // no number is ever recomputed downstream. Empty when the data is missing.
  periods: FineResult[];
}

export type Obligation = ProceduralObligation | PerformanceObligation;

export interface LawAnalyzer {
  lawId: string;
  // Whether this law binds this specific building, given everything known.
  appliesTo: (facts: BuildingFacts) => boolean;
  // The obligation(s) this law places on the building. A single law may emit
  // both kinds (LL88: file a lighting plan, and actually upgrade the lighting).
  analyze: (facts: BuildingFacts) => Obligation[];
}

export interface ObligationAssessment {
  address: string;
  bbl: string;
  obligations: Obligation[];
  // Cross-cutting notes about the assessment as a whole (e.g. why a law that
  // usually applies was skipped).
  notes: string[];
}

function lawName(lawId: string): string {
  return LAWS.find(law => law.id === lawId)?.name ?? lawId;
}

// LL97 is the one performance law fully wired today. The optimizer that closes
// the gap lives elsewhere (it spans every performance obligation at once); this
// analyzer only describes where the building stands.
const ll97Analyzer: LawAnalyzer = {
  lawId: "ll97",
  appliesTo: facts => facts.isLl97Covered === true,
  analyze: facts => {
    const { input, missing } = toEngineInput(facts);

    if (!input) {
      return [
        {
          kind: "performance",
          lawId: "ll97",
          lawName: lawName("ll97"),
          title: "Hold annual emissions under the building's cap",
          status: "unknown",
          periods: [],
          findings: [
            `Exposure can't be computed yet: the city has no ${missing.join(", ")} ` +
              "for this building (usually a missing LL84 benchmarking filing).",
          ],
          recommendations: [
            "File the LL84 benchmarking report so the emissions baseline exists.",
          ],
        },
      ];
    }

    const periods = computeAllPeriods(input);
    const currentPeriod = periods.find(period => period.period === "2024-2029")!;
    const anyOverage = periods.some(period => !period.compliant);

    const status: ComplianceStatus = input.isArticle321
      ? "due"
      : !currentPeriod.compliant
        ? "at_risk"
        : anyOverage
          ? "due"
          : "satisfied";

    return [
      {
        kind: "performance",
        lawId: "ll97",
        lawName: lawName("ll97"),
        title: "Hold annual emissions under the building's cap",
        status,
        periods,
        findings: ll97Findings(periods, input.isArticle321 ?? false),
        recommendations: ll97Recommendations(status, input.isArticle321 ?? false),
      },
    ];
  },
};

function ll97Findings(periods: FineResult[], isArticle321: boolean): string[] {
  if (isArticle321) {
    return [
      "Article 321 pathway: this building complies through prescribed energy " +
        "conservation measures or by meeting its 2030 limit early, not the " +
        "$268/tCO2e penalty. Flat $10,000 non-compliance penalties are not modeled.",
    ];
  }

  return periods.map(period => {
    if (period.compliant) {
      return `${period.period}: ${period.actualEmissionsTco2e.toLocaleString("en-US")} tCO2e against a cap of ${period.emissionsLimitTco2e.toLocaleString("en-US")} — compliant.`;
    }
    return `${period.period}: ${period.actualEmissionsTco2e.toLocaleString("en-US")} tCO2e against a cap of ${period.emissionsLimitTco2e.toLocaleString("en-US")} — ${period.overageTco2e.toLocaleString("en-US")} over, $${Math.round(period.annualFineUsd).toLocaleString("en-US")}/yr.`;
  });
}

function ll97Recommendations(status: ComplianceStatus, isArticle321: boolean): string[] {
  if (isArticle321) {
    return [
      "Confirm the Article 321 prescriptive measures are filed; the retrofit " +
        "optimizer can rank them against the 2030 target.",
    ];
  }
  if (status === "satisfied") {
    return [];
  }
  return [
    "Close the emissions gap with the cheapest measure set the retrofit " +
      "optimizer finds; this obligation feeds that whole-building plan.",
  ];
}

// LL84 is the first procedural law. Today it only checks whether any
// benchmarking filing is on record; confirming the filing is current for this
// cycle year is deferred to the filing-status capability (Task B).
const ll84Analyzer: LawAnalyzer = {
  lawId: "ll84",
  appliesTo: facts => (facts.grossFloorAreaSqft ?? 0) >= 25_000,
  analyze: facts => {
    const hasFiling = facts.infrastructureProfile?.hasLl84Filing ?? false;

    return [
      {
        kind: "procedural",
        lawId: "ll84",
        lawName: lawName("ll84"),
        title: "File annual energy and water benchmarking by May 1",
        status: hasFiling ? "satisfied" : "due",
        penaltyUsd: 2_500,
        findings: [
          hasFiling
            ? "A benchmarking filing is on record in the LL84 dataset (cycle-year " +
              "currency not yet verified)."
            : "No benchmarking filing found for this building in the LL84 dataset.",
        ],
        recommendations: hasFiling
          ? []
          : [
              "Submit the LL84 benchmarking report through ENERGY STAR Portfolio " +
                "Manager before the May 1 deadline.",
            ],
      },
    ];
  },
};

export const LAW_ANALYZERS: LawAnalyzer[] = [ll97Analyzer, ll84Analyzer];

// One address, every obligation. Resolves nothing itself — callers pass the
// already-assembled facts so the address is looked up exactly once upstream.
export function assessObligations(
  facts: BuildingFacts,
  analyzers: LawAnalyzer[] = LAW_ANALYZERS,
): ObligationAssessment {
  const applicable = analyzers.filter(analyzer => analyzer.appliesTo(facts));
  const obligations = applicable.flatMap(analyzer => analyzer.analyze(facts));

  const notes: string[] = [];
  if (obligations.length === 0) {
    notes.push("No modeled law binds this building given the data on record.");
  }

  return {
    address: facts.address,
    bbl: facts.bbl,
    obligations,
    notes,
  };
}

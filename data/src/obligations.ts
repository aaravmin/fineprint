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
  // Civil penalty if the deadline is missed. Null when the penalty regime is a
  // flat statutory amount rather than a priced overage (e.g. Article 321).
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
  // The obligation(s) this law places on the building. asOf dates every cycle
  // deadline, so the result is deterministic and testable.
  analyze: (facts: BuildingFacts, asOf: Date) => Obligation[];
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
// Standard LL97: the $268/tCO2e cap regime. Article 321 buildings are covered
// by LL97 too but on a different pathway, so they get their own analyzer below
// and are excluded here.
const ll97Analyzer: LawAnalyzer = {
  lawId: "ll97",
  appliesTo: facts => facts.isLl97Covered === true && !facts.isArticle321,
  analyze: facts => {
    const { input, missing } = toEngineInput(facts);

    if (!input) {
      return [missingDataPerformance("ll97", missing)];
    }

    const periods = computeAllPeriods(input);
    const currentPeriod = periods.find(period => period.period === "2024-2029")!;
    const anyOverage = periods.some(period => !period.compliant);

    const status: ComplianceStatus = !currentPeriod.compliant
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
        findings: ll97Findings(periods),
        recommendations:
          status === "satisfied"
            ? []
            : [
                "Close the emissions gap with the cheapest measure set the retrofit " +
                  "optimizer finds; this obligation feeds that whole-building plan.",
              ],
      },
    ];
  },
};

// Article 321: rent-regulated / affordable buildings comply by holding 2024
// emissions under their 2030 limit, or by the prescribed measures of
// 28-321.2.2 — no $268/tCO2e penalty, but flat $10,000 penalties if neither.
const article321Analyzer: LawAnalyzer = {
  lawId: "art321",
  appliesTo: facts => facts.isArticle321 === true,
  analyze: facts => {
    const { input, missing } = toEngineInput(facts);

    if (!input) {
      return [missingDataPerformance("art321", missing)];
    }

    const periods = computeAllPeriods(input);
    const target2030 = periods[0].emissionsLimitTco2e;
    const current = input.annualEmissionsTco2e;
    const underTarget = current <= target2030;

    return [
      {
        kind: "performance",
        lawId: "art321",
        lawName: lawName("art321"),
        title: "Comply via prescribed measures or the 2030 emissions target",
        status: underTarget ? "due" : "at_risk",
        periods,
        findings: [
          "Article 321 pathway: comply through the prescribed energy conservation " +
            "measures (28-321.2.2) or by holding emissions under the 2030 limit " +
            "(28-321.2.1). No $268/tCO2e penalty, but flat $10,000 non-compliance " +
            "penalties apply (not modeled).",
          underTarget
            ? `Current emissions ${current.toLocaleString("en-US")} tCO2e clear the 2030 target of ${target2030.toLocaleString("en-US")} tCO2e — the performance pathway is available.`
            : `Current emissions ${current.toLocaleString("en-US")} tCO2e exceed the 2030 target of ${target2030.toLocaleString("en-US")} tCO2e — prescribed measures or a retrofit are required.`,
        ],
        recommendations: [
          underTarget
            ? "File the Article 321 compliance report certifying emissions under the 2030 limit."
            : "Implement the prescribed measures, or retrofit to clear the 2030 limit; the retrofit plan ranks the cheapest compliant measure set.",
        ],
      },
    ];
  },
};

function missingDataPerformance(lawId: string, missing: string[]): PerformanceObligation {
  return {
    kind: "performance",
    lawId,
    lawName: lawName(lawId),
    title: "Hold annual emissions under the building's cap",
    status: "unknown",
    periods: [],
    findings: [
      `Exposure can't be computed yet: the city has no ${missing.join(", ")} ` +
        "for this building (usually a missing energy benchmarking disclosure).",
    ],
    recommendations: [
      "File the energy benchmarking report so the emissions baseline exists.",
    ],
  };
}

function ll97Findings(periods: FineResult[]): string[] {
  return periods.map(period => {
    if (period.compliant) {
      return `${period.period}: ${period.actualEmissionsTco2e.toLocaleString("en-US")} tCO2e against a cap of ${period.emissionsLimitTco2e.toLocaleString("en-US")} — compliant.`;
    }
    return `${period.period}: ${period.actualEmissionsTco2e.toLocaleString("en-US")} tCO2e against a cap of ${period.emissionsLimitTco2e.toLocaleString("en-US")} — ${period.overageTco2e.toLocaleString("en-US")} over, $${Math.round(period.annualFineUsd).toLocaleString("en-US")}/yr.`;
  });
}

export const LAW_ANALYZERS: LawAnalyzer[] = [ll97Analyzer, article321Analyzer];

// One address, every obligation. Resolves nothing itself — callers pass the
// already-assembled facts so the address is looked up exactly once upstream.
// asOf dates the filing cycles; it defaults to now but is injectable for tests.
export function assessObligations(
  facts: BuildingFacts,
  options: { asOf?: Date; analyzers?: LawAnalyzer[] } = {},
): ObligationAssessment {
  const asOf = options.asOf ?? new Date();
  const analyzers = options.analyzers ?? LAW_ANALYZERS;

  const applicable = analyzers.filter(analyzer => analyzer.appliesTo(facts));
  const obligations = applicable.flatMap(analyzer => analyzer.analyze(facts, asOf));

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

// The decarbonization plan Fineprint prepares for a building. It lists the
// retrofit measures that move the building toward or under its LL97 cap, drawn
// from the building's personalized measure list, with the emissions position from
// the engine. The owner enters nothing. This is the recommended path, ready to
// share or export.

import { type CompliancePlan, type PersonalizedMeasure, parseCompliancePlan } from "@/lib/compliance/plan";
import type { Building } from "@/lib/data/types";
import { computePeriods, type RetrofitAssessment } from "@/lib/engine";

import type { Deliverable, DeliverableSection, DeliverableStat } from "./types";

const tco2e = (value: number): string => `${Math.round(value).toLocaleString("en-US")} tCO2e`;
const usd0 = (value: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

function dedash(text: string): string {
  return text.replace(/[–—]/g, " ");
}

// The recommended measures for this building, best value first.
function recommendedMeasures(plan: CompliancePlan | null): PersonalizedMeasure[] {
  return (plan?.personalization?.measures ?? [])
    .filter((measure) => measure.applicability === "recommended" || measure.applicability === "applicable")
    .sort((a, b) => (a.costPerTco2eAvoided ?? Infinity) - (b.costPerTco2eAvoided ?? Infinity));
}

export function buildDecarbonizationDeliverable(
  building: Building,
  assessment: RetrofitAssessment | null,
  generatedAt: string,
): Deliverable {
  const plan = parseCompliancePlan(building.compliancePlanJson);
  const measures = recommendedMeasures(plan);
  const periods = computePeriods(building);
  const overageNow = periods?.[0]?.overageTco2e ?? null;

  const totalCut = measures.reduce((sum, measure) => sum + (measure.estReductionTco2e ?? 0), 0);
  const pricedCapex = measures.reduce((sum, measure) => sum + (measure.capexUsd ?? 0), 0);
  const somePriced = measures.some((measure) => measure.capexUsd != null);

  const stats: DeliverableStat[] = [{ label: "Measures", value: String(measures.length), tone: "muted" }];
  if (totalCut > 0) {
    stats.push({ label: "Emissions cut", value: `${tco2e(totalCut)} a year`, tone: "ok" });
  }
  if (somePriced) {
    stats.push({ label: "Est. capital", value: usd0(pricedCapex), tone: "muted" });
  }
  if (overageNow != null && overageNow > 0) {
    stats.push(
      totalCut >= overageNow
        ? { label: "Projected", value: "Under the cap", tone: "ok" }
        : { label: "Still over by", value: tco2e(overageNow - totalCut), tone: "warn" },
    );
  }

  const sections: DeliverableSection[] = [];

  if (measures.length > 0) {
    sections.push({
      heading: "Recommended measures",
      table: {
        columns: ["Measure", "Est. capital", "Emissions cut a year", "Why it fits this building"],
        rows: measures.map((measure) => [
          measure.name,
          measure.capexUsd != null ? usd0(measure.capexUsd) : "",
          measure.estReductionTco2e != null ? tco2e(measure.estReductionTco2e) : "",
          dedash(measure.why || measure.applicabilityReason || ""),
        ]),
        note: "Ordered by cost per tonne avoided. Costs are sourced estimates for typical buildings, not engineering quotes.",
      },
    });
  } else if (assessment && assessment.macc.length > 0) {
    // No personalized catalog yet, so fall back to the engine's abatement curve.
    sections.push({
      heading: "Candidate measures",
      table: {
        columns: ["Measure", "Cost per tonne", "Emissions cut a year"],
        rows: assessment.macc
          .filter((point) => point.annualReductionTco2e > 0)
          .slice(0, 8)
          .map((point) => [point.name, usd0(point.usdPerTco2e), tco2e(point.annualReductionTco2e)]),
        note: "Generic estimates. A building-specific plan appears once the systems dossier is on file.",
      },
    });
  } else {
    sections.push({
      heading: "Recommended measures",
      note: "No retrofit plan yet. The recommended measures appear here once this building's systems and emissions are on file.",
    });
  }

  if (periods && overageNow != null) {
    sections.push({
      heading: "Compliance impact",
      rows: [
        { label: "Emissions over the cap now", value: overageNow > 0 ? tco2e(overageNow) : "None" },
        { label: "Reduction from these measures", value: totalCut > 0 ? `${tco2e(totalCut)} a year` : "" },
        {
          label: "Projected position",
          value:
            overageNow <= 0
              ? "Under the cap"
              : totalCut >= overageNow
                ? "Under the cap after these measures"
                : `${tco2e(overageNow - totalCut)} still over`,
        },
      ],
    });
  }

  return {
    kind: "decarbonization",
    title: "Decarbonization plan",
    purpose: "Your recommended path to lower emissions and LL97 penalty exposure, for planning and capital budgeting.",
    building: { address: building.address, bbl: building.bbl ?? null, bin: building.bin ?? null, sqft: building.sqft },
    stats,
    sections,
    notes: [
      "Prepared by Fineprint from the building's systems dossier and the LL97 emissions model. Preliminary recommendations, not final engineering scopes.",
    ],
    generatedAt,
  };
}

// The professional compliance report (Phase 8): the structure and language a
// building-compliance consultant or energy auditor would use, assembled from
// what the app already knows. Pure — plain inputs in, a structured report out —
// so the dashboard renders it and an export can serialize it identically.
//
// The conventions here follow professional ASHRAE/LL97 deliverables (see
// data/normalized/professional_output_format_research.md): flat, conditional
// status language; exposure stated as records-based estimates; costs as ranges;
// deadlines as dates or named cycles; an explicit assumptions/limitations and a
// source appendix. No consumer reassurance ("you're all set"), no false
// precision, no hidden requirements.

import { lawById } from "@/lib/laws/lawRegistry";

export type FindingStatus =
  | "applies"
  | "may_apply"
  | "does_not_apply"
  | "unknown"
  | "missing_data";

export const STATUS_LABEL: Record<FindingStatus, string> = {
  applies: "Applies",
  may_apply: "May apply",
  does_not_apply: "Does not apply",
  unknown: "Unknown",
  missing_data: "Missing data",
};

export interface ReportBuilding {
  address: string;
  bbl: string | null;
  sqft: number;
  buildingType: string | null;
  yearBuilt: number | null;
  primaryUse: string | null;
}

// One raw finding the dashboard assembles per law from the registry + building.
export interface ReportFindingInput {
  lawId: string;
  status: FindingStatus;
  nextDeadline: string | null; // ISO date or null
  cadence: string | null; // named statutory cycle when no single date
  estimatedExposureUsd: number | null;
  sourceDataUsed: string[];
  missingData: string[];
}

export interface ReportRecommendationInput {
  measure: string;
  issueAddressed: string;
  lawIds: string[];
  costLowUsd: number | null;
  costHighUsd: number | null;
  costUnit: string | null;
  annualSavingsUsd: number | null;
  annualEnergySavings: string | null;
  priority: "Immediate" | "Near-term" | "Capital planning";
  source: string;
}

export interface ReportInputs {
  building: ReportBuilding;
  findings: ReportFindingInput[];
  recommendations: ReportRecommendationInput[];
  binder: {
    obligationsTotal: number;
    openItems: number;
    obligationsMissingRequiredEvidence: number;
  } | null;
  generatedAt?: string;
}

export interface ReportFinding {
  law_id: string;
  law: string;
  short: string;
  status: FindingStatus;
  status_label: string;
  applicability: string;
  requirement: string;
  next_deadline: string | null;
  cadence: string | null;
  estimated_exposure: string;
  source_data_used: string[];
  missing_data: string[];
  recommended_action: string;
}

export interface ComplianceReport {
  building_summary: ReportBuilding;
  compliance_snapshot: {
    applicable: string[];
    not_applicable: string[];
    missing_data: string[];
    nearest_deadline: string | null;
    estimated_annual_exposure_usd: number;
    highest_risk: string[];
  };
  findings: ReportFinding[];
  recommendations: ReportRecommendationInput[];
  action_plan: { immediate: string[]; near_term: string[]; capital_planning: string[]; recurring: string[] };
  assumptions_and_limitations: string[];
  source_appendix: string[];
  generated_at: string;
}

function usd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function exposurePhrase(finding: ReportFindingInput): string {
  if (finding.status === "does_not_apply") {
    return "Not applicable.";
  }
  if (finding.status === "missing_data") {
    return "Could not be estimated — required source data is missing.";
  }
  if (finding.estimatedExposureUsd === null) {
    return "No monetary penalty is modeled for this requirement.";
  }
  if (finding.estimatedExposureUsd === 0) {
    return "No immediate exposure identified based on available records.";
  }
  return `Estimated annual exposure of ${usd(finding.estimatedExposureUsd)} based on available records.`;
}

function recommendedAction(finding: ReportFindingInput, requirementSteps: string): string {
  if (finding.status === "does_not_apply") {
    return "No action required; this requirement does not bind the building.";
  }
  if (finding.status === "missing_data") {
    return `Obtain the missing records (${finding.missingData.join(", ")}) so applicability and exposure can be confirmed.`;
  }
  return requirementSteps;
}

// The one-line requirement and a default action come from the registry's
// description / applicability logic, so the report and the dashboard agree.
export function buildComplianceReport(inputs: ReportInputs): ComplianceReport {
  const findings: ReportFinding[] = inputs.findings.map(finding => {
    const law = lawById(finding.lawId);
    const requirement = law?.description ?? finding.lawId;
    const defaultAction =
      finding.nextDeadline !== null
        ? `Complete the ${law?.short_name ?? finding.lawId} requirement before ${finding.nextDeadline}.`
        : `Complete the ${law?.short_name ?? finding.lawId} requirement on its stated cycle.`;

    return {
      law_id: finding.lawId,
      law: law?.display_name ?? finding.lawId,
      short: law?.short_name ?? finding.lawId,
      status: finding.status,
      status_label: STATUS_LABEL[finding.status],
      applicability: law?.applies_to_logic ?? "",
      requirement,
      next_deadline: finding.nextDeadline,
      cadence: finding.cadence,
      estimated_exposure: exposurePhrase(finding),
      source_data_used: finding.sourceDataUsed,
      missing_data: finding.missingData,
      recommended_action: recommendedAction(finding, defaultAction),
    };
  });

  const applies = findings.filter(f => f.status === "applies");
  const totalExposure = inputs.findings
    .filter(f => f.status === "applies")
    .reduce((sum, f) => sum + (f.estimatedExposureUsd ?? 0), 0);
  const deadlines = inputs.findings
    .map(f => f.nextDeadline)
    .filter((d): d is string => !!d)
    .sort();
  const highestRisk = [...applies]
    .filter(f => f.status === "applies")
    .sort(
      (a, b) =>
        (inputs.findings.find(x => x.lawId === b.law_id)?.estimatedExposureUsd ?? 0) -
        (inputs.findings.find(x => x.lawId === a.law_id)?.estimatedExposureUsd ?? 0),
    )
    .slice(0, 3)
    .map(f => `${f.short}: ${f.estimated_exposure}`);

  return {
    building_summary: inputs.building,
    compliance_snapshot: {
      applicable: applies.map(f => f.short),
      not_applicable: findings.filter(f => f.status === "does_not_apply").map(f => f.short),
      missing_data: findings.filter(f => f.status === "missing_data").map(f => f.short),
      nearest_deadline: deadlines[0] ?? null,
      estimated_annual_exposure_usd: Math.round(totalExposure),
      highest_risk: highestRisk,
    },
    findings,
    recommendations: inputs.recommendations,
    action_plan: {
      immediate: findings
        .filter(f => f.status === "applies" && f.next_deadline !== null)
        .map(f => f.recommended_action),
      near_term: inputs.recommendations
        .filter(r => r.priority === "Near-term")
        .map(r => `${r.measure}: ${r.issueAddressed}`),
      capital_planning: inputs.recommendations
        .filter(r => r.priority === "Capital planning")
        .map(r => `${r.measure}: ${r.issueAddressed}`),
      recurring: findings
        .filter(f => f.status === "applies" && f.cadence !== null)
        .map(f => `${f.short}: ${f.cadence}`),
    },
    assumptions_and_limitations: [
      "This report is an owner/property-manager record, not a filed report or a legal determination of compliance.",
      "Exposure and deadline figures are estimates from available public records; a Registered Design Professional should verify before filing or capital decisions.",
      "Where required source data is missing, the requirement is shown as 'missing data' rather than assumed compliant.",
      "Retrofit cost ranges and savings are sourced estimates for typical buildings, not engineering scopes or quotes.",
    ],
    source_appendix: [
      "Law applicability, statutory deadlines, and penalty rates: Fineprint law registry (NYC Admin Code citations per law).",
      "Building characteristics: NYC PLUTO and the LL84 energy & water benchmarking disclosure.",
      "Emissions and LL97 exposure: the building's reported emissions vs its occupancy-weighted cap.",
      "Retrofit cost and savings: NYC NYSERDA/Urban Green cost studies, NREL REMDB, and NREL ResStock (see the master measure file).",
    ],
    generated_at: inputs.generatedAt ?? new Date().toISOString(),
  };
}

// The one typed reader for the stored compliance plan and building-systems JSON.
// The data worker writes these blobs (canonical shapes in
// data/src/compliancePlan.ts); every dashboard surface parses them through here
// so there is no second, drifting interface. Parsing is defensive: a missing or
// malformed blob returns null, and array fields always come back as arrays.

// biome-ignore lint/correctness/noUndeclaredDependencies: fineprint-engine is a tsconfig path alias to ../engine/src, resolved by TS and Turbopack, not an npm package.
import type { RetrofitCategory } from "fineprint-engine";

export type Pathway = "standard" | "article321" | null;

export type Handling = "retrofit_measures" | "filing" | "already_compliant" | "needs_attention";

export interface PlanMeasure {
  id: string;
  name: string;
  capexUsd: number;
  alsoSatisfies: string[];
}

export interface ObligationDisposition {
  lawId: string;
  lawName: string;
  kind: "performance" | "procedural";
  status: string;
  handledBy: string;
  detail: string;
}

export interface FineDataExplanation {
  status: string;
  message: string;
  missing: string[];
}

export type SystemKey =
  | "heating_plant"
  | "domestic_hot_water"
  | "cooling"
  | "envelope"
  | "solar_pv"
  | "elevators"
  | "electrical_service"
  | "lighting";

export interface EvidenceRef {
  dataset: string;
  datasetId: string;
  recordId: string | null;
  date: string | null;
  note: string;
}

export interface SystemAssessment {
  system: SystemKey;
  presence: "confirmed" | "assumed" | "none" | "unknown";
  headline: string;
  fuel: string | null;
  vintageYear: number | null;
  vintageBasis: string | null;
  condition: "failing" | "aging" | "serviceable" | "recently_replaced" | "unknown";
  conditionSignals: string[];
  estAnnualTco2e: number | null;
  shareOfEmissions: number | null;
  attributionBasis: string | null;
  confidence: "high" | "medium" | "low";
  evidence: EvidenceRef[];
}

export interface BuildingSystems {
  systems: SystemAssessment[];
  totalTco2e: number | null;
  attributionNote: string;
  generatedFrom: string[];
}

export type MeasureApplicability = "recommended" | "applicable" | "already_done" | "not_applicable";

export interface PersonalizedMeasure {
  id: string;
  name: string;
  targetSystem: SystemKey;
  // The retrofit category this measure groups under. Optional for backward
  // compatibility with plans persisted before categories existed; the client
  // falls back to categoryForSystem(targetSystem) when absent.
  category?: RetrofitCategory;
  exclusiveGroup?: string;
  reducesEmissions?: boolean;
  applicability: MeasureApplicability;
  applicabilityReason: string;
  estReductionTco2e: number | null;
  effectiveReductionFraction: number | null;
  capexUsd: number | null;
  capexBasis: string;
  costPerTco2eAvoided: number | null;
  why: string;
  evidence: EvidenceRef[];
}

export interface Personalization {
  systems: BuildingSystems | null;
  measures: PersonalizedMeasure[];
}

export interface CompliancePlan {
  address: string;
  bbl: string;
  pathway: Pathway;
  measures: PlanMeasure[];
  totalCapexUsd: number;
  dispositions: ObligationDisposition[];
  crossCredits: string[];
  fineData: FineDataExplanation | null;
  personalization: Personalization | null;
  notes: string[];
}

// The eight systems in the order the dossier lays them out, with their labels.
export const SYSTEM_ORDER: SystemKey[] = [
  "heating_plant",
  "domestic_hot_water",
  "cooling",
  "envelope",
  "solar_pv",
  "elevators",
  "electrical_service",
  "lighting",
];

export const SYSTEM_DISPLAY_NAME: Record<SystemKey, string> = {
  heating_plant: "Heating",
  domestic_hot_water: "Hot water",
  cooling: "Cooling",
  envelope: "Envelope",
  solar_pv: "Solar",
  elevators: "Elevators",
  electrical_service: "Electrical service",
  lighting: "Lighting",
};

// City record names read better than dataset codes in a tooltip. These mirror
// the dossier's own source table (data/src/buildingSystems.ts) so a reader sees
// one vocabulary across the product. Anything not mapped falls back to its raw id.
const SOURCE_DISPLAY_NAME: Record<string, string> = {
  "5zyy-y8am": "LL84 Benchmarking Disclosure",
  "64uk-42ks": "NYC PLUTO",
  "ipu4-2q9a": "DOB Permit Issuance (BIS)",
  "ic3t-wcy2": "DOB Job Application Filings (BIS)",
  "3h2n-5cm9": "DOB Violations",
  "wvxf-dwi5": "HPD Housing Maintenance Code Violations",
  "ygpa-z7cr": "HPD Complaints and Problems",
  "f4rp-2kvy": "DEP Clean Air Tracking System",
  "e5aq-a4j2": "DOB NOW Elevator Devices",
  "dm9a-ab7w": "DOB NOW Electrical Permits",
};

export function sourceDisplayName(datasetId: string): string {
  return SOURCE_DISPLAY_NAME[datasetId] ?? datasetId;
}

// City law names arrive with an em dash ("LL97 — Building Emissions Cap"); the
// dashboard never renders that character, so sanitize any data-derived copy.
export function dedash(text: string): string {
  return text.replace(/[–—]/g, "-");
}

function normalizeBuildingSystems(raw: unknown): BuildingSystems | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = raw as Partial<BuildingSystems>;
  return {
    systems: Array.isArray(value.systems) ? value.systems : [],
    totalTco2e: typeof value.totalTco2e === "number" ? value.totalTco2e : null,
    attributionNote: typeof value.attributionNote === "string" ? value.attributionNote : "",
    generatedFrom: Array.isArray(value.generatedFrom) ? value.generatedFrom : [],
  };
}

function normalizePersonalization(raw: unknown): Personalization | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = raw as { systems?: unknown; measures?: unknown };
  return {
    systems: normalizeBuildingSystems(value.systems),
    measures: Array.isArray(value.measures) ? (value.measures as PersonalizedMeasure[]) : [],
  };
}

export function parseCompliancePlan(json: string | undefined | null): CompliancePlan | null {
  if (!json) {
    return null;
  }

  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    return {
      address: typeof raw.address === "string" ? raw.address : "",
      bbl: typeof raw.bbl === "string" ? raw.bbl : "",
      pathway: raw.pathway === "standard" || raw.pathway === "article321" ? raw.pathway : null,
      measures: Array.isArray(raw.measures) ? (raw.measures as PlanMeasure[]) : [],
      totalCapexUsd: typeof raw.totalCapexUsd === "number" ? raw.totalCapexUsd : 0,
      dispositions: Array.isArray(raw.dispositions) ? (raw.dispositions as ObligationDisposition[]) : [],
      crossCredits: Array.isArray(raw.crossCredits) ? (raw.crossCredits as string[]) : [],
      fineData: (raw.fineData as FineDataExplanation | undefined) ?? null,
      personalization: normalizePersonalization(raw.personalization),
      notes: Array.isArray(raw.notes) ? (raw.notes as string[]) : [],
    };
  } catch {
    return null;
  }
}

export function parseBuildingSystems(json: string | undefined | null): BuildingSystems | null {
  if (!json) {
    return null;
  }

  try {
    return normalizeBuildingSystems(JSON.parse(json));
  } catch {
    return null;
  }
}

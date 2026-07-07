// The wire format of an ingest: what the worker attaches to its intake
// submission (payload_json) and what scripts pass straight to the
// ingest_building RPC. One converter so the camelCase intake vocabulary and
// the database's snake_case columns can never drift, and the one place
// coveredLawIdsJson is parsed and shape-checked before anything trusts it.

import type { BuildingProfile } from "./laws";
import type { IntakeResult } from "./intake";
import { taskSpecsForIngest, type TaskSpec } from "./taskSpecs";

export interface IngestPayload {
  address: string;
  bbl: string;
  bin: string;
  sqft: number;
  is_article321: boolean;
  annual_emissions_tco2e: number | null;
  uses_json: string;
  ll97_covered: boolean | null;
  provenance_json: string;
  ll97_annual_fine_usd: number | null;
  compliance_plan_json: string | null;
  num_floors: number | null;
  units_residential: number | null;
  community_district: number | null;
  energy_star_score: number | null;
  task_specs: TaskSpec[];
}

export function parseCoveredLawIds(coveredLawIdsJson: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(coveredLawIdsJson);
  } catch {
    throw new Error("coveredLawIdsJson is not valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.some(id => typeof id !== "string")) {
    throw new Error("coveredLawIdsJson must be a JSON array of law id strings");
  }
  return parsed;
}

export function toIngestPayload(
  ingestArgs: IntakeResult["ingestArgs"],
  asOf: Date = new Date(),
): IngestPayload {
  const coveredLawIds = parseCoveredLawIds(ingestArgs.coveredLawIdsJson);

  const profile: BuildingProfile = {
    sqft: ingestArgs.sqft,
    isAffordable: ingestArgs.isArticle321,
    bbl: ingestArgs.bbl,
    numFloors: ingestArgs.numFloors,
    unitsResidential: ingestArgs.unitsResidential,
    communityDistrict: ingestArgs.communityDistrict,
    energyStarScore: ingestArgs.energyStarScore,
  };

  return {
    address: ingestArgs.address,
    bbl: ingestArgs.bbl,
    bin: ingestArgs.bin,
    sqft: ingestArgs.sqft,
    is_article321: ingestArgs.isArticle321,
    annual_emissions_tco2e: ingestArgs.annualEmissionsTco2E ?? null,
    uses_json: ingestArgs.usesJson,
    ll97_covered:
      coveredLawIds.length === 0
        ? null
        : coveredLawIds.includes("ll97") || coveredLawIds.includes("art321"),
    provenance_json: ingestArgs.provenanceJson,
    ll97_annual_fine_usd: ingestArgs.ll97AnnualFineUsd ?? null,
    compliance_plan_json: ingestArgs.compliancePlanJson ?? null,
    num_floors: ingestArgs.numFloors ?? null,
    units_residential: ingestArgs.unitsResidential ?? null,
    community_district: ingestArgs.communityDistrict ?? null,
    energy_star_score: ingestArgs.energyStarScore ?? null,
    task_specs: taskSpecsForIngest(
      ingestArgs.address,
      profile,
      coveredLawIds,
      ingestArgs.ll97AnnualFineUsd,
      asOf,
    ),
  };
}

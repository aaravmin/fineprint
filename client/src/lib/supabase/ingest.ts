import "server-only";

// biome-ignore lint/correctness/noUndeclaredDependencies: fineprint-laws is a tsconfig path alias to ../data/laws.ts, resolved by TS and Turbopack, not an npm package.
import { applicableLaws, type BuildingProfile, LAWS, type Law } from "fineprint-laws";

import { createAdminSupabase } from "./admin";
import type { Json } from "./types";

// The ready-to-ingest args a worker attached to its intake submission — the
// same shape data/src/intake.ts's IntakeResult.ingestArgs produces.
export interface IngestArgs {
  address: string;
  bbl: string;
  bin: string;
  sqft: number;
  isArticle321: boolean;
  annualEmissionsTco2E: number | undefined;
  usesJson: string;
  coveredLawIdsJson: string;
  provenanceJson: string;
  ll97AnnualFineUsd: number | undefined;
  compliancePlanJson: string;
  numFloors: number | undefined;
  unitsResidential: number | undefined;
  communityDistrict: number | undefined;
  energyStarScore: number | undefined;
}

// The TypeScript half of the old ingestFromArgs reducer. The law registry
// (coverage, statutory deadlines, penalties) is TS and cannot live in SQL, so
// this computes the building row and the full covered-law task set, then hands
// them to the ingest_building RPC which does the atomic upsert + backfill in one
// transaction. Runs with the service-role client because the RPC is service-role
// only; the caller must already have verified `owner` owns the work.
export async function ingestBuilding(args: IngestArgs, owner: string): Promise<number> {
  if (args.address.trim() === "") throw new Error("address cannot be empty");
  if (args.bbl.trim() === "") throw new Error("bbl cannot be empty");

  const profile: BuildingProfile = {
    sqft: args.sqft,
    isAffordable: args.isArticle321,
    bbl: args.bbl,
    numFloors: args.numFloors,
    unitsResidential: args.unitsResidential,
    communityDistrict: args.communityDistrict,
    energyStarScore: args.energyStarScore,
  };

  const coveredLawIds: string[] = JSON.parse(args.coveredLawIdsJson);
  const laws = (
    coveredLawIds.length > 0 ? LAWS.filter((law) => coveredLawIds.includes(law.id)) : applicableLaws(profile)
  ).filter((law) => law.kind !== "pace_financing");

  const now = new Date();

  const buildingPayload = {
    address: args.address,
    bbl: args.bbl,
    bin: args.bin,
    sqft: args.sqft,
    is_affordable: args.isArticle321,
    annual_emissions_tco2e: args.annualEmissionsTco2E ?? null,
    uses_json: parseJson(args.usesJson),
    ll97_covered: deriveLl97Covered(coveredLawIds),
    provenance_json: parseJson(args.provenanceJson),
    num_floors: args.numFloors ?? null,
    units_residential: args.unitsResidential ?? null,
    community_district: args.communityDistrict ?? null,
    energy_star_score: args.energyStarScore ?? null,
    compliance_plan_json: parseJson(args.compliancePlanJson),
  };

  const taskPayload = laws.map((law) => {
    const isLl97Law = law.id === "ll97" || law.id === "art321";
    const engineFine = isLl97Law ? args.ll97AnnualFineUsd : undefined;
    const stubFine = law.penaltyUsd(profile);
    const fine = engineFine ?? stubFine ?? undefined;

    return {
      law_id: law.id,
      kind: law.kind,
      title: `${law.name} — ${args.address}`,
      status: "open",
      deadline: deadlineFor(law, now, profile).toISOString(),
      fine_estimate_usd: fine ?? null,
    };
  });

  const supabase = createAdminSupabase();
  const { data, error } = await supabase.rpc("ingest_building", {
    p_owner: owner,
    p_building: buildingPayload as unknown as Json,
    p_tasks: taskPayload as unknown as Json,
    p_ll97_fine: args.ll97AnnualFineUsd ?? undefined,
  });

  if (error) {
    throw new Error(`ingest_building failed: ${error.message}`);
  }

  return data as number;
}

// The task's deadline is the law's real next statutory deadline; when the cycle
// can't be dated from what intake resolved, fall back to a one-year review
// window rather than inventing a date. Mirrors reducers.ts deadlineFor.
function deadlineFor(law: Law, now: Date, profile: BuildingProfile): Date {
  const next = law.nextDeadline(now, profile);
  if (next === null) {
    return new Date(now.getTime() + 365 * 86_400_000);
  }
  return next;
}

function deriveLl97Covered(coveredLawIds: string[]): boolean | null {
  if (coveredLawIds.length === 0) {
    return null;
  }
  return coveredLawIds.includes("ll97") || coveredLawIds.includes("art321");
}

// Storage from the worker is already valid JSON, but never let a malformed
// column blow up an approval.
function parseJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

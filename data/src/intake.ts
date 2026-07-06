// The shared brain of building intake: one address in, ready-to-send
// ingest_building reducer args plus a human-readable summary out. The ingest
// script and the agent workers both call this — neither reimplements the
// coverage mapping or the engine handoff.

import { computeFine } from "../../engine/src/index.ts";
import { applicableLaws, LAWS } from "../laws.ts";
import { assessBuildingSystems } from "./buildingSystems.ts";
import { assessSystemDeadlines } from "./systemDeadlines.ts";
import type { UserOverrides } from "./overrides.ts";
import { buildCompliancePlan } from "./compliancePlan.ts";
import { assessObligations } from "./obligations.ts";
import { getCblEntry as realGetCblEntry, type CblEntry } from "./coveredBuildings.ts";
import { toEngineInput } from "./engineBridge.ts";
import { lookupBuilding as realLookupBuilding } from "./lookup.ts";
import type { Bbl, BuildingFacts } from "./types.ts";

export interface IntakeDeps {
  lookupBuilding: (address: string) => Promise<BuildingFacts>;
  getCblEntry: (bbl: Bbl) => CblEntry | null;
}

const realDeps: IntakeDeps = {
  lookupBuilding: realLookupBuilding,
  getCblEntry: realGetCblEntry,
};

export interface IntakeResult {
  facts: BuildingFacts;
  ingestArgs: {
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
    // The building's systems dossier (assessBuildingSystems), serialized. Rides
    // in alongside the compliance plan so the module can persist it without
    // importing the data layer, and the dashboard can render the per-system view.
    systemsJson: string;
    // Inspection-driven "act-by" deadlines (assessSystemDeadlines), serialized.
    // Same asOf as the dossier, so their status is consistent with it.
    systemDeadlinesJson: string;
    numFloors: number | undefined;
    unitsResidential: number | undefined;
    communityDistrict: number | undefined;
    energyStarScore: number | undefined;
  };
  summary: string;
}

export async function prepareIntake(
  address: string,
  deps: IntakeDeps = realDeps,
  overrides?: UserOverrides,
): Promise<IntakeResult> {
  // One clock for the whole intake: the systems dossier, obligations, and
  // compliance plan all date their recency judgments from the same instant, so
  // the persisted artifacts are internally consistent.
  const asOf = new Date();
  const facts = await deps.lookupBuilding(address);
  const cbl = deps.getCblEntry(facts.bbl);

  const systems = assessBuildingSystems(facts, asOf, overrides);
  const systemDeadlines = assessSystemDeadlines(facts, asOf);

  // Coverage and the compliance plan must come from the same brain — the
  // LAW_ANALYZERS in obligations.ts - or the dashboard shows a plan that
  // disagrees with the tickets it spawned. The CBL stays authoritative for the
  // one thing it decides best, the LL97 performance pathway; the registry's
  // sqft thresholds remain the pathway fallback when the building has no CBL
  // row. With no floor area known, no PLUTO row, and no CBL row, we know
  // nothing - claim nothing.
  const knownSqft = facts.grossFloorAreaSqft ?? 0;
  const knowsAnything =
    knownSqft > 0 || facts.plutoCharacteristics !== null || cbl !== null;

  const sizeApplicableLawIds =
    knownSqft > 0
      ? applicableLaws({ sqft: knownSqft, isAffordable: facts.isArticle321 ?? false }).map(
          law => law.id,
        )
      : [];

  const ll97PathwayLawIds = cbl
    ? [
        cbl.ll97 && !cbl.article321 ? "ll97" : null,
        cbl.article321 ? "art321" : null,
      ].filter((id): id is string => id !== null)
    : sizeApplicableLawIds.filter(id => id === "ll97" || id === "art321");

  const analyzerLawIds = knowsAnything
    ? assessObligations(facts, { asOf })
        .obligations.map(obligation => obligation.lawId)
        .filter(id => id !== "ll97" && id !== "art321")
    : [];

  const registryOrder = new Map(LAWS.map((law, index) => [law.id, index]));
  const coveredLawIds = Array.from(
    new Set([...ll97PathwayLawIds, ...analyzerLawIds]),
  ).sort(
    (a, b) =>
      (registryOrder.get(a) ?? LAWS.length) - (registryOrder.get(b) ?? LAWS.length),
  );

  // The current-period LL97 fine, computed by the engine. The module cannot
  // import the engine, so the number rides in with the facts.
  const { input: engineInput } = toEngineInput(facts);
  const ll97AnnualFineUsd = engineInput
    ? Math.round(computeFine(engineInput, "2024-2029").annualFineUsd)
    : undefined;

  const compliancePlan = buildCompliancePlan(facts, { asOf, systems });

  return {
    facts,
    ingestArgs: {
      address: facts.address,
      bbl: facts.bbl,
      bin: facts.bin ?? "",
      sqft: facts.grossFloorAreaSqft ?? 0,
      isArticle321: facts.isArticle321 ?? false,
      annualEmissionsTco2E: facts.annualEmissionsTco2e ?? undefined,
      usesJson: JSON.stringify(facts.occupancyGroups),
      coveredLawIdsJson: JSON.stringify(coveredLawIds),
      provenanceJson: JSON.stringify(facts.provenance),
      ll97AnnualFineUsd,
      compliancePlanJson: JSON.stringify(compliancePlan),
      systemsJson: JSON.stringify(systems),
      systemDeadlinesJson: JSON.stringify(systemDeadlines),
      numFloors: facts.plutoCharacteristics?.numFloors ?? undefined,
      unitsResidential: facts.plutoCharacteristics?.unitsResidential ?? undefined,
      communityDistrict: facts.plutoCharacteristics?.communityDistrict ?? undefined,
      energyStarScore: facts.infrastructureProfile?.energyStarScore ?? undefined,
    },
    summary: intakeSummary(facts, coveredLawIds, ll97AnnualFineUsd),
  };
}

function intakeSummary(
  facts: BuildingFacts,
  coveredLawIds: string[],
  ll97AnnualFineUsd: number | undefined,
): string {
  const lines = [
    `BUILDING INTAKE — ${facts.address}`,
    ``,
    `BBL: ${facts.bbl}`,
    `Floor area: ${facts.grossFloorAreaSqft?.toLocaleString("en-US") ?? "unknown"} sqft`,
    `Reported emissions: ${facts.annualEmissionsTco2e?.toLocaleString("en-US") ?? "unknown"} tCO2e/yr`,
    `Covered by: ${coveredLawIds.join(", ") || "no sustainability law on the DOB list"}`,
    `LL97 fine (2024-2029, engine): ${
      ll97AnnualFineUsd === undefined
        ? "unknown — missing data"
        : `$${ll97AnnualFineUsd.toLocaleString("en-US")}/yr`
    }`,
  ];

  const sources = new Set(facts.provenance.map(note => note.source));
  if (sources.size > 0) {
    lines.push(``, `Sources:`, ...[...sources].map(source => `  - ${source}`));
  }

  return lines.join("\n");
}

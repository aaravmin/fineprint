// The shared brain of building intake: one address in, ready-to-send
// ingest_building reducer args plus a human-readable summary out. The ingest
// script and the agent workers both call this — neither reimplements the
// coverage mapping or the engine handoff.

import { computeFine } from "../../engine/src/index.ts";
import { buildCompliancePlan } from "./compliancePlan.ts";
import { getCblEntry as realGetCblEntry, type CblEntry } from "./coveredBuildings.ts";
import { toEngineInput } from "./engineBridge.ts";
import { lookupBuilding as realLookupBuilding } from "./lookup.ts";
import { LAW_ANALYZERS } from "./obligations.ts";
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
    sqft: number;
    isArticle321: boolean;
    annualEmissionsTco2E: number | undefined;
    usesJson: string;
    coveredLawIdsJson: string;
    provenanceJson: string;
    ll97AnnualFineUsd: number | undefined;
    compliancePlanJson: string;
  };
  summary: string;
}

export async function prepareIntake(
  address: string,
  deps: IntakeDeps = realDeps,
): Promise<IntakeResult> {
  const facts = await deps.lookupBuilding(address);
  const cbl = deps.getCblEntry(facts.bbl);

  // The size-based laws — benchmarking, audit, facade, lighting, gas, and the
  // affordable-housing allergen law — are governed by the statutory floor-area
  // (and affordability) thresholds, not by the Covered Buildings List. The CBL
  // only carries LL97/LL84/LL87/LL88 flags, and they come back sparse, so
  // keying coverage off them silently dropped every obligation but the
  // hardcoded LL152 (and never spawned LL11 at all). Drive those laws off the
  // registry's thresholds instead, and let the CBL stay authoritative for just
  // the one thing it decides best: the LL97 performance pathway. With no floor
  // area known and no CBL row, we know nothing — claim nothing.
  // Which laws actually bind this building, decided by the obligation analyzers
  // — the same PLUTO-aware tests buildCompliancePlan reasons with, so the tasks
  // we spawn match the obligations the plan covers. LL11 turns on stories, LL55
  // on residential unit count, not floor area alone. With no floor area and no
  // PLUTO record we know nothing, so we claim nothing.
  const hasBuildingData =
    (facts.grossFloorAreaSqft ?? 0) > 0 || facts.plutoCharacteristics != null;
  const analyzerLawIds = hasBuildingData
    ? LAW_ANALYZERS.filter(analyzer => analyzer.appliesTo(facts)).map(
        analyzer => analyzer.lawId,
      )
    : [];

  const ll97PathwayLawIds = cbl
    ? [
        cbl.ll97 && !cbl.article321 ? "ll97" : null,
        cbl.article321 ? "art321" : null,
      ].filter((id): id is string => id !== null)
    : analyzerLawIds.filter(id => id === "ll97" || id === "art321");

  const coveredLawIds = Array.from(
    new Set([
      ...ll97PathwayLawIds,
      ...analyzerLawIds.filter(id => id !== "ll97" && id !== "art321"),
    ]),
  );

  // The current-period LL97 fine, computed by the engine. The module cannot
  // import the engine, so the number rides in with the facts.
  const { input: engineInput } = toEngineInput(facts);
  const ll97AnnualFineUsd = engineInput
    ? Math.round(computeFine(engineInput, "2024-2029").annualFineUsd)
    : undefined;

  const compliancePlan = buildCompliancePlan(facts);

  return {
    facts,
    ingestArgs: {
      address: facts.address,
      bbl: facts.bbl,
      sqft: facts.grossFloorAreaSqft ?? 0,
      isArticle321: facts.isArticle321 ?? false,
      annualEmissionsTco2E: facts.annualEmissionsTco2e ?? undefined,
      usesJson: JSON.stringify(facts.occupancyGroups),
      coveredLawIdsJson: JSON.stringify(coveredLawIds),
      provenanceJson: JSON.stringify(facts.provenance),
      ll97AnnualFineUsd,
      compliancePlanJson: JSON.stringify(compliancePlan),
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

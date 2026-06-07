// The shared brain of building intake: one address in, ready-to-send
// ingest_building reducer args plus a human-readable summary out. The ingest
// script and the agent workers both call this — neither reimplements the
// coverage mapping or the engine handoff.

import { computeFine } from "../../engine/src/index.ts";
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
    sqft: number;
    isArticle321: boolean;
    annualEmissionsTco2E: number | undefined;
    usesJson: string;
    coveredLawIdsJson: string;
    provenanceJson: string;
    ll97AnnualFineUsd: number | undefined;
  };
  summary: string;
}

export async function prepareIntake(
  address: string,
  deps: IntakeDeps = realDeps,
): Promise<IntakeResult> {
  const facts = await deps.lookupBuilding(address);
  const cbl = deps.getCblEntry(facts.bbl);

  const coveredLawIds = cbl
    ? [
        cbl.ll97 && !cbl.article321 ? "ll97" : null,
        cbl.article321 ? "art321" : null,
        cbl.ll84 ? "ll84" : null,
        cbl.ll87 ? "ll87" : null,
        cbl.ll88 ? "ll88" : null,
        // Gas service assumed present until DOB data lands (registry stub).
        "ll152",
        // Article 321 means rent-regulated residential — the allergen law
        // rides along (residential proxy until unit counts land).
        cbl.article321 ? "ll55" : null,
      ].filter((id): id is string => id !== null)
    : [];

  // The current-period LL97 fine, computed by the engine. The module cannot
  // import the engine, so the number rides in with the facts.
  const { input: engineInput } = toEngineInput(facts);
  const ll97AnnualFineUsd = engineInput
    ? Math.round(computeFine(engineInput, "2024-2029").annualFineUsd)
    : undefined;

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

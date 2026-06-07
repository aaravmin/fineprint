import { describe, expect, test } from "vitest";
import type { CblEntry } from "../src/coveredBuildings.ts";
import { prepareIntake } from "../src/intake.ts";
import type { BuildingFacts } from "../src/types.ts";

// prepareIntake is the shared brain of building intake: one address in,
// ready-to-send ingest_building reducer args plus a human-readable summary
// out. The ingest script and the agent workers both call it.
const esbFacts: BuildingFacts = {
  bbl: "1008350041",
  bin: "1015862",
  address: "350 5 AVENUE, New York, NY, USA",
  grossFloorAreaSqft: 2_852_257,
  occupancyGroups: [{ group: "Office", sqft: 2_852_257 }],
  annualEmissionsTco2e: 12_096.78,
  isLl97Covered: true,
  isArticle321: false,
  plutoCharacteristics: null,
  openViolations: [],
  provenance: [{ field: "bbl", source: "NYC GeoSearch" }],
};

const cblEntry: CblEntry = {
  ll97: true,
  article321: false,
  ll84: true,
  ll87: true,
  ll88: true,
  dofGrossSqft: 2_812_739,
  dofAddress: "338 5 AVENUE",
  source: "DOB Sustainability Covered Buildings List, Filing Year 2026",
};

function fakeDeps(overrides: Partial<Parameters<typeof prepareIntake>[1]> = {}) {
  return {
    lookupBuilding: async () => esbFacts,
    getCblEntry: () => cblEntry,
    ...overrides,
  };
}

describe("prepareIntake", () => {
  test("produces reducer-ready args with DOB's coverage flags", async () => {
    const intake = await prepareIntake("350 5th Avenue, Manhattan", fakeDeps());

    expect(intake.ingestArgs.bbl).toBe("1008350041");
    expect(intake.ingestArgs.sqft).toBe(2_852_257);
    expect(intake.ingestArgs.isArticle321).toBe(false);
    expect(JSON.parse(intake.ingestArgs.coveredLawIdsJson)).toEqual([
      "ll97",
      "ll84",
      "ll87",
      "ll88",
      "ll152",
    ]);
    expect(JSON.parse(intake.ingestArgs.usesJson)).toHaveLength(1);
  });

  test("computes the current-period fine through the engine", async () => {
    const intake = await prepareIntake("350 5th Avenue, Manhattan", fakeDeps());

    // ESB is compliant in 2024-2029 — the honest number is zero.
    expect(intake.ingestArgs.ll97AnnualFineUsd).toBe(0);
  });

  test("an Article 321 building maps to the art321 law, not ll97", async () => {
    const intake = await prepareIntake(
      "39 Whitehall Street, Manhattan",
      fakeDeps({
        lookupBuilding: async () => ({ ...esbFacts, isArticle321: true }),
        getCblEntry: () => ({ ...cblEntry, article321: true }),
      }),
    );

    const lawIds = JSON.parse(intake.ingestArgs.coveredLawIdsJson);
    expect(lawIds).toContain("art321");
    expect(lawIds).not.toContain("ll97");
    // Article 321 means rent-regulated residential — the allergen law rides along.
    expect(lawIds).toContain("ll55");
  });

  test("the summary reads like a report: building, coverage, exposure, sources", async () => {
    const intake = await prepareIntake("350 5th Avenue, Manhattan", fakeDeps());

    expect(intake.summary).toMatch(/1008350041/);
    expect(intake.summary).toMatch(/2,852,257/);
    expect(intake.summary).toMatch(/ll97, ll84, ll87, ll88, ll152/);
    expect(intake.summary).toMatch(/NYC GeoSearch/);
  });

  test("a building with no data degrades honestly", async () => {
    const intake = await prepareIntake(
      "1 Pike Street, Manhattan",
      fakeDeps({
        lookupBuilding: async () => ({
          ...esbFacts,
          grossFloorAreaSqft: null,
          occupancyGroups: [],
          annualEmissionsTco2e: null,
          isLl97Covered: false,
          provenance: [],
        }),
        getCblEntry: () => null,
      }),
    );

    expect(intake.ingestArgs.sqft).toBe(0);
    expect(intake.ingestArgs.ll97AnnualFineUsd).toBeUndefined();
    expect(JSON.parse(intake.ingestArgs.coveredLawIdsJson)).toEqual([]);
    expect(intake.summary).toMatch(/unknown/i);
  });

  test("an unresolvable address propagates the lookup error", async () => {
    const deps = fakeDeps({
      lookupBuilding: async () => {
        throw new Error('no NYC address found for "nowhere"');
      },
    });

    await expect(prepareIntake("nowhere", deps)).rejects.toThrow(/no NYC address found/);
  });
});

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
      "ll11",
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
    expect(intake.summary).toMatch(/ll97, ll84, ll87, ll11, ll88, ll152/);
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

// Coverage is what the reported bug was about: small buildings were collapsing
// to LL152 alone and LL11 never appeared. These pin the size-threshold logic
// (the registry's floor-area cutoffs) against the CBL's narrower authority.
describe("prepareIntake coverage by building size", () => {
  function buildingOf(sqft: number, isArticle321 = false): BuildingFacts {
    return {
      ...esbFacts,
      grossFloorAreaSqft: sqft,
      occupancyGroups: [{ group: "Office", sqft }],
      isArticle321,
    };
  }

  async function coverageFor(
    facts: BuildingFacts,
    getCblEntry: () => CblEntry | null = () => null,
  ): Promise<Set<string>> {
    const intake = await prepareIntake(
      facts.address,
      fakeDeps({ lookupBuilding: async () => facts, getCblEntry }),
    );
    return new Set<string>(JSON.parse(intake.ingestArgs.coveredLawIdsJson));
  }

  test("an under-25k building is covered by LL152 alone", async () => {
    expect(await coverageFor(buildingOf(13_194))).toEqual(new Set(["ll152"]));
  });

  test("the 25k threshold is inclusive: LL84, LL88, LL97, LL152 switch on", async () => {
    expect(await coverageFor(buildingOf(25_000))).toEqual(
      new Set(["ll97", "ll84", "ll88", "ll152"]),
    );
    // One square foot short stays LL152-only — the boundary is exact.
    expect(await coverageFor(buildingOf(24_999))).toEqual(new Set(["ll152"]));
  });

  test("crossing 50k adds the LL87 audit obligation", async () => {
    expect(await coverageFor(buildingOf(50_000))).toEqual(
      new Set(["ll97", "ll84", "ll87", "ll88", "ll152"]),
    );
  });

  test("crossing 60k adds the LL11 facade obligation that used to never spawn", async () => {
    expect(await coverageFor(buildingOf(60_000))).toContain("ll11");
  });

  test("the CBL is authoritative for LL97: a large building it excludes gets no LL97", async () => {
    const notLl97Covered = (): CblEntry => ({
      ll97: false,
      article321: false,
      ll84: false,
      ll87: false,
      ll88: false,
      dofGrossSqft: null,
      dofAddress: null,
      source: "test",
    });

    const coverage = await coverageFor(buildingOf(100_000), notLl97Covered);

    expect(coverage.has("ll97")).toBe(false);
    // The size-based obligations still apply regardless of the LL97 flag.
    expect(coverage).toEqual(new Set(["ll84", "ll87", "ll11", "ll88", "ll152"]));
  });

  test("an affordable building maps to art321 and the allergen law, never LL97", async () => {
    const coverage = await coverageFor(buildingOf(100_000, true));

    expect(coverage.has("art321")).toBe(true);
    expect(coverage.has("ll55")).toBe(true);
    expect(coverage.has("ll97")).toBe(false);
  });
});

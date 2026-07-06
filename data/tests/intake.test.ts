import { describe, expect, test } from "vitest";
import type { CblEntry } from "../src/coveredBuildings.ts";
import { prepareIntake } from "../src/intake.ts";
import { emptyPublicRecords } from "../src/lookup.ts";
import type { BuildingFacts, PlutoCharacteristics } from "../src/types.ts";

// prepareIntake is the shared brain of building intake: one address in,
// ready-to-send ingest_building reducer args plus a human-readable summary
// out. The ingest script and the agent workers both call it.
//
// PLUTO is what decides the height- and residential-keyed laws (LL11 on
// stories, LL55 on residential units), so the fixtures carry it. 350 5 Avenue
// is a 102-floor commercial office tower with no apartments.
const esbPluto: PlutoCharacteristics = {
  bbl: "1008350041",
  numFloors: 102,
  buildingClass: "O4",
  bldgAreaSqft: 2_852_257,
  unitsResidential: 0,
  unitsTotal: 1000,
  yearBuilt: 1931,
  landUse: "05",
  ownerName: "EMPIRE STATE REALTY OP LP",
  communityDistrict: 105,
  raw: {},
};

const esbFacts: BuildingFacts = {
  bbl: "1008350041",
  bin: "1015862",
  address: "350 5 AVENUE, New York, NY, USA",
  grossFloorAreaSqft: 2_852_257,
  occupancyGroups: [{ group: "Office", sqft: 2_852_257 }],
  annualEmissionsTco2e: 12_096.78,
  isLl97Covered: true,
  isArticle321: false,
  plutoCharacteristics: esbPluto,
  openViolations: [],
  ll84FuelUse: [],
  publicRecords: emptyPublicRecords(),
  provenance: [{ field: "bbl", source: "NYC GeoSearch" }],
};

const cblEntry: CblEntry = {
  ll97: true,
  article321: false,
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
    expect(JSON.parse(intake.ingestArgs.coveredLawIdsJson)).toEqual(["ll97"]);
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
        lookupBuilding: async () => ({
          ...esbFacts,
          isArticle321: true,
          // A real affordable building is residential, so PLUTO shows units —
          // that is what spawns the allergen law.
          plutoCharacteristics: { ...esbPluto, unitsResidential: 200 },
        }),
        getCblEntry: () => ({ ...cblEntry, article321: true }),
      }),
    );

    const lawIds = JSON.parse(intake.ingestArgs.coveredLawIdsJson);
    expect(lawIds).toContain("art321");
    expect(lawIds).not.toContain("ll97");
  });

  test("the summary reads like a report: building, coverage, exposure, sources", async () => {
    const intake = await prepareIntake("350 5th Avenue, Manhattan", fakeDeps());

    expect(intake.summary).toMatch(/1008350041/);
    expect(intake.summary).toMatch(/2,852,257/);
    expect(intake.summary).toMatch(/ll97/);
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
          plutoCharacteristics: null,
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

// Coverage pins LL97 applicability: the 25k floor-area threshold, the CBL as
// the authoritative covered-buildings source, and the Article 321 pathway for
// affordable housing.
describe("prepareIntake coverage", () => {
  function buildingOf(
    sqft: number,
    opts: {
      numFloors?: number;
      unitsResidential?: number;
      isLl97Covered?: boolean;
      isArticle321?: boolean;
    } = {},
  ): BuildingFacts {
    return {
      ...esbFacts,
      grossFloorAreaSqft: sqft,
      occupancyGroups: [{ group: "Office", sqft }],
      isLl97Covered: opts.isLl97Covered ?? false,
      isArticle321: opts.isArticle321 ?? false,
      plutoCharacteristics: {
        ...esbPluto,
        numFloors: opts.numFloors ?? 3,
        unitsResidential: opts.unitsResidential ?? 0,
      },
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

  test("the 25k threshold is inclusive for LL97", async () => {
    expect(await coverageFor(buildingOf(25_000))).toEqual(new Set(["ll97"]));
    // One square foot short clears no law - the boundary is exact.
    expect(await coverageFor(buildingOf(24_999))).toEqual(new Set([]));
  });

  test("the CBL is authoritative for LL97: a large building it excludes gets no LL97", async () => {
    const notLl97Covered = (): CblEntry => ({
      ll97: false,
      article321: false,
      dofGrossSqft: null,
      dofAddress: null,
      source: "test",
    });

    const coverage = await coverageFor(
      buildingOf(100_000, { numFloors: 10 }),
      notLl97Covered,
    );

    expect(coverage.has("ll97")).toBe(false);
    // With LL97 excluded by the CBL, no modeled law binds this building.
    expect(coverage).toEqual(new Set([]));
  });

  test("an affordable residential building maps to art321, not standard LL97", async () => {
    const article321Cbl = (): CblEntry => ({
      ...cblEntry,
      ll97: false,
      article321: true,
    });

    const coverage = await coverageFor(
      buildingOf(100_000, { numFloors: 20, unitsResidential: 200, isArticle321: true }),
      article321Cbl,
    );

    expect(coverage.has("art321")).toBe(true);
    expect(coverage.has("ll97")).toBe(false);
  });
});

// The bug this pins: tickets spawned from the crude sqft/affordable registry
// while the compliance plan ran the fact-rich analyzers, so a small market-rate
// walk-up showed two laws in its plan but spawned only the LL152 ticket.
// Coverage must come from the same analyzers the plan uses.
describe("prepareIntake coverage agrees with the compliance plan", () => {
  const walkUpFacts: BuildingFacts = {
    ...esbFacts,
    bbl: "3051400037",
    address: "171 EAST 29 STREET, Brooklyn, NY, USA",
    grossFloorAreaSqft: 12_100,
    occupancyGroups: [],
    annualEmissionsTco2e: null,
    isLl97Covered: false,
    isArticle321: false,
    plutoCharacteristics: {
      bbl: "3051400037",
      numFloors: 4,
      buildingClass: "C1",
      bldgAreaSqft: 12_100,
      unitsResidential: 8,
      unitsTotal: 8,
      yearBuilt: 1931,
      landUse: null,
      ownerName: null,
      communityDistrict: null,
      raw: {},
    },
  };

  function walkUpDeps() {
    return fakeDeps({
      lookupBuilding: async () => walkUpFacts,
      getCblEntry: () => null,
    });
  }

  test("every law in the compliance plan spawns a ticket", async () => {
    const intake = await prepareIntake(walkUpFacts.address, walkUpDeps());

    const coverage = new Set(JSON.parse(intake.ingestArgs.coveredLawIdsJson));
    const planLawIds = new Set(
      JSON.parse(intake.ingestArgs.compliancePlanJson).laws.map(
        (law: { lawId: string }) => law.lawId,
      ),
    );
    expect(coverage).toEqual(planLawIds);
  });
});

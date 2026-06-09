import { describe, expect, test } from "vitest";
import type { CblEntry } from "../src/coveredBuildings.ts";
import { prepareIntake } from "../src/intake.ts";
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
      "ll33",
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
    // Residential units carry the allergen law along.
    expect(lawIds).toContain("ll55");
  });

  test("the summary reads like a report: building, coverage, exposure, sources", async () => {
    const intake = await prepareIntake("350 5th Avenue, Manhattan", fakeDeps());

    expect(intake.summary).toMatch(/1008350041/);
    expect(intake.summary).toMatch(/2,852,257/);
    expect(intake.summary).toMatch(/ll97, ll84, ll87, ll11, ll88, ll33, ll152/);
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

// Coverage is what the reported bug was about: small buildings collapsed to
// LL152 alone, LL11 never appeared, and residential laws never fired. These pin
// the corrected applicability — floor area for the energy laws, stories for
// LL11, residential units for LL55, and the CBL for the LL97 pathway.
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

  test("an under-25k commercial building is covered by LL152 alone", async () => {
    expect(await coverageFor(buildingOf(13_194))).toEqual(new Set(["ll152"]));
  });

  test("the 25k threshold is inclusive for the floor-area laws", async () => {
    expect(await coverageFor(buildingOf(25_000))).toEqual(
      new Set(["ll97", "ll84", "ll88", "ll33", "ll152"]),
    );
    // One square foot short stays LL152-only — the boundary is exact.
    expect(await coverageFor(buildingOf(24_999))).toEqual(new Set(["ll152"]));
  });

  test("crossing 50k adds the LL87 audit obligation", async () => {
    expect(await coverageFor(buildingOf(50_000))).toEqual(
      new Set(["ll97", "ll84", "ll87", "ll88", "ll33", "ll152"]),
    );
  });

  test("LL11 turns on stories, not floor area", async () => {
    // A tall but small building gets the facade obligation a 60k cutoff missed.
    expect(await coverageFor(buildingOf(30_000, { numFloors: 7 }))).toContain("ll11");
    // Six stories is the statutory floor — at six it does not apply.
    expect(await coverageFor(buildingOf(30_000, { numFloors: 6 }))).not.toContain("ll11");
  });

  test("LL55 turns on residential units, not the affordability flag alone", async () => {
    expect(await coverageFor(buildingOf(40_000, { unitsResidential: 50 }))).toContain(
      "ll55",
    );
    expect(await coverageFor(buildingOf(40_000, { unitsResidential: 0 }))).not.toContain(
      "ll55",
    );
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

    const coverage = await coverageFor(
      buildingOf(100_000, { numFloors: 10 }),
      notLl97Covered,
    );

    expect(coverage.has("ll97")).toBe(false);
    // The size- and height-based obligations still apply regardless of LL97.
    expect(coverage).toEqual(new Set(["ll84", "ll87", "ll88", "ll33", "ll11", "ll152"]));
  });

  test("an affordable residential building maps to art321 and the allergen law", async () => {
    const article321Cbl = (): CblEntry => ({ ...cblEntry, ll97: false, article321: true });

    const coverage = await coverageFor(
      buildingOf(100_000, { numFloors: 20, unitsResidential: 200, isArticle321: true }),
      article321Cbl,
    );

    expect(coverage.has("art321")).toBe(true);
    expect(coverage.has("ll55")).toBe(true);
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

  test("a small market-rate walk-up gets the allergen law, not LL152 alone", async () => {
    const intake = await prepareIntake(walkUpFacts.address, walkUpDeps());

    const coverage = new Set(JSON.parse(intake.ingestArgs.coveredLawIdsJson));
    expect(coverage).toEqual(new Set(["ll152", "ll55"]));
  });

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

  test("a tall building under 60k sqft still gets the facade law from its floor count", async () => {
    const tallNarrow: BuildingFacts = {
      ...walkUpFacts,
      plutoCharacteristics: {
        ...walkUpFacts.plutoCharacteristics!,
        numFloors: 12,
        unitsResidential: 0,
        unitsTotal: 0,
      },
    };

    const intake = await prepareIntake(
      tallNarrow.address,
      fakeDeps({ lookupBuilding: async () => tallNarrow, getCblEntry: () => null }),
    );

    expect(JSON.parse(intake.ingestArgs.coveredLawIdsJson)).toContain("ll11");
  });
});

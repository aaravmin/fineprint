import { describe, expect, test } from "vitest";
import type { CblEntry } from "../src/coveredBuildings.ts";
import { lookupBuilding } from "../src/lookup.ts";
import type { BblResult, Ll84Facts } from "../src/types.ts";

// The orchestrator is tested with stand-ins for the three sources so the
// suite runs offline; each source has its own fixture-backed tests. Values
// mirror the Empire State Building.
const geoResult: BblResult = {
  bbl: "1008350041",
  normalizedAddress: "350 5 AVENUE, New York, NY, USA",
  borough: "Manhattan",
};

const ll84Facts: Ll84Facts = {
  bbl: "1008350041",
  reportedAddress: "ESRT - Empire State Building",
  grossFloorAreaSqft: 2_852_257,
  occupancyGroups: [
    { group: "Office", sqft: 2_692_475.1 },
    { group: "Restaurant", sqft: 50_021 },
  ],
  annualEmissionsTco2e: 16_678.22,
  reportingYear: 2024,
  proxiedUses: [],
  unmappedUses: [],
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

function fakeSources(overrides: Partial<Parameters<typeof lookupBuilding>[1]> = {}) {
  return {
    lookupBbl: async () => geoResult,
    fetchLl84: async () => ll84Facts,
    getCblEntry: () => cblEntry,
    ...overrides,
  };
}

describe("lookupBuilding", () => {
  test("assembles engine-ready facts from all three sources", async () => {
    const facts = await lookupBuilding("350 5th Avenue, Manhattan", fakeSources());

    expect(facts.bbl).toBe("1008350041");
    expect(facts.address).toBe("350 5 AVENUE, New York, NY, USA");
    expect(facts.grossFloorAreaSqft).toBe(2_852_257);
    expect(facts.occupancyGroups).toHaveLength(2);
    expect(facts.annualEmissionsTco2e).toBe(16_678.22);
    expect(facts.isLl97Covered).toBe(true);
    expect(facts.isArticle321).toBe(false);
  });

  test("every populated field names its source", async () => {
    const facts = await lookupBuilding("350 5th Avenue, Manhattan", fakeSources());
    const fields = facts.provenance.map(note => note.field);

    expect(fields).toContain("bbl");
    expect(fields).toContain("grossFloorAreaSqft");
    expect(fields).toContain("annualEmissionsTco2e");
    expect(fields).toContain("isLl97Covered");
  });

  test("no LL84 filing: floor area falls back to DOF records, gaps are noted", async () => {
    const facts = await lookupBuilding(
      "350 5th Avenue, Manhattan",
      fakeSources({ fetchLl84: async () => null }),
    );

    expect(facts.grossFloorAreaSqft).toBe(2_812_739);
    expect(facts.occupancyGroups).toEqual([]);
    expect(facts.annualEmissionsTco2e).toBeNull();

    const noteText = facts.provenance.map(note => note.detail ?? "").join(" ");
    expect(noteText).toMatch(/no LL84 filing/i);
  });

  test("a building absent from the covered buildings list is not covered", async () => {
    const facts = await lookupBuilding(
      "350 5th Avenue, Manhattan",
      fakeSources({ getCblEntry: () => null }),
    );

    expect(facts.isLl97Covered).toBe(false);
    expect(facts.isArticle321).toBe(false);
  });

  test("proxied and unmapped uses surface in provenance", async () => {
    const facts = await lookupBuilding(
      "1 Firehouse Plaza, Manhattan",
      fakeSources({
        fetchLl84: async () => ({
          ...ll84Facts,
          occupancyGroups: [{ group: "Other - Public Services", sqft: 12_000 }],
          proxiedUses: [{ from: "Fire Station", to: "Other - Public Services" }],
          unmappedUses: [{ group: "Other", sqft: 3_000 }],
        }),
      }),
    );

    const noteText = facts.provenance.map(note => note.detail ?? "").join(" | ");
    expect(noteText).toMatch(/Fire Station.*Other - Public Services/);
    expect(noteText).toMatch(/3,000 sqft.*excluded/);
  });

  test("an unresolvable address propagates GeoSearch's error", async () => {
    const sources = fakeSources({
      lookupBbl: async () => {
        throw new Error('no NYC address found for "nowhere"');
      },
    });

    await expect(lookupBuilding("nowhere", sources)).rejects.toThrow(
      /no NYC address found/,
    );
  });
});

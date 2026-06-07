import { describe, expect, test } from "vitest";
import type { CblEntry } from "../src/coveredBuildings.ts";
import { lookupBuilding } from "../src/lookup.ts";
import type { BblResult, Ll84Facts } from "../src/types.ts";

// The orchestrator is tested with stand-ins for the three sources so the
// suite runs offline; each source has its own fixture-backed tests. Values
// mirror the Empire State Building.
const geoResult: BblResult = {
  bbl: "1008350041",
  bin: "1015862",
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
  recomputedEmissionsTco2e: 12_096.78,
  reportingYear: 2024,
  proxiedUses: [],
  unmappedUses: [],
  unpriceableFuels: [],
  fuelMix: ["electricity", "district_steam"],
  heatingFuel: "district_steam",
  siteEuiKbtuPerSqft: 61.4,
  energyStarScore: 78,
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
    lookupBblCandidates: async () => [geoResult],
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
    expect(facts.isLl97Covered).toBe(true);
    expect(facts.isArticle321).toBe(false);
  });

  test("emissions use the statute-coefficient recompute when available", async () => {
    const facts = await lookupBuilding("350 5th Avenue, Manhattan", fakeSources());

    expect(facts.annualEmissionsTco2e).toBe(12_096.78);
    const emissionsNote = facts.provenance.find(
      note => note.field === "annualEmissionsTco2e",
    );
    expect(emissionsNote?.detail).toMatch(/28-320\.3\.1\.1/);
  });

  test("falls back to location-based GHG when a fuel cannot be priced", async () => {
    const facts = await lookupBuilding(
      "350 5th Avenue, Manhattan",
      fakeSources({
        fetchLl84: async () => ({
          ...ll84Facts,
          recomputedEmissionsTco2e: null,
          unpriceableFuels: ["fuel_oil_5_6_use_kbtu"],
        }),
      }),
    );

    expect(facts.annualEmissionsTco2e).toBe(16_678.22);
    const emissionsNote = facts.provenance.find(
      note => note.field === "annualEmissionsTco2e",
    );
    expect(emissionsNote?.detail).toMatch(/location-based/i);
    expect(emissionsNote?.detail).toMatch(/fuel_oil_5_6/);
  });

  test("prefers the GeoSearch candidate that DOF actually knows", async () => {
    const wrongLot: BblResult = {
      bbl: "1002830094",
      bin: null,
      normalizedAddress: "1 PIKE STREET, New York, NY, USA",
      borough: "Manhattan",
    };
    const dofLot: BblResult = {
      bbl: "1000020023",
      bin: null,
      normalizedAddress: "1 PIKE ST., New York, NY, USA",
      borough: "Manhattan",
    };

    const facts = await lookupBuilding(
      "1 Pike Street, Manhattan",
      fakeSources({
        lookupBblCandidates: async () => [wrongLot, dofLot],
        getCblEntry: bbl => (bbl === "1000020023" ? cblEntry : null),
      }),
    );

    expect(facts.bbl).toBe("1000020023");
    const bblNote = facts.provenance.find(note => note.field === "bbl");
    expect(bblNote?.detail).toMatch(/candidate/i);
  });

  test("never hops to a covered lot with a different house number", async () => {
    const queriedLot: BblResult = {
      bbl: "1002830094",
      bin: null,
      normalizedAddress: "1 PIKE STREET, New York, NY, USA",
      borough: "Manhattan",
    };
    const otherBuildingDownTheStreet: BblResult = {
      bbl: "1002550001",
      bin: null,
      normalizedAddress: "51 PIKE STREET, New York, NY, USA",
      borough: "Manhattan",
    };

    const facts = await lookupBuilding(
      "1 Pike Street, Manhattan",
      fakeSources({
        lookupBblCandidates: async () => [queriedLot, otherBuildingDownTheStreet],
        getCblEntry: bbl => (bbl === "1002550001" ? cblEntry : null),
      }),
    );

    // 51 Pike is a different building, covered or not — stay on 1 Pike.
    expect(facts.bbl).toBe("1002830094");
  });

  test("every populated field names its source", async () => {
    const facts = await lookupBuilding("350 5th Avenue, Manhattan", fakeSources());
    const fields = facts.provenance.map(note => note.field);

    expect(fields).toContain("bbl");
    expect(fields).toContain("grossFloorAreaSqft");
    expect(fields).toContain("annualEmissionsTco2e");
    expect(fields).toContain("isLl97Covered");
  });

  test("coverage notes admit the list is an annual reference snapshot", async () => {
    const facts = await lookupBuilding("350 5th Avenue, Manhattan", fakeSources());
    const coverageNote = facts.provenance.find(note => note.field === "isLl97Covered");

    expect(coverageNote?.detail).toMatch(/reference/i);
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

  test("a building absent from the covered buildings list is not covered", async () => {
    const facts = await lookupBuilding(
      "350 5th Avenue, Manhattan",
      fakeSources({ getCblEntry: () => null }),
    );

    expect(facts.isLl97Covered).toBe(false);
    expect(facts.isArticle321).toBe(false);
  });

  test("an unresolvable address propagates GeoSearch's error", async () => {
    const sources = fakeSources({
      lookupBblCandidates: async () => {
        throw new Error('no NYC address found for "nowhere"');
      },
    });

    await expect(lookupBuilding("nowhere", sources)).rejects.toThrow(
      /no NYC address found/,
    );
  });
});

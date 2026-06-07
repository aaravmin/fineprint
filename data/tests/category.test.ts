import { describe, expect, test } from "vitest";
import { categorizeBuilding, type PlaceLookup } from "../src/category.ts";
import type { BuildingFacts, PlutoCharacteristics } from "../src/types.ts";

function pluto(overrides: Partial<PlutoCharacteristics>): PlutoCharacteristics {
  return {
    bbl: "1008350041",
    numFloors: null,
    buildingClass: null,
    bldgAreaSqft: null,
    unitsResidential: null,
    unitsTotal: null,
    yearBuilt: null,
    landUse: null,
    ownerName: null,
    communityDistrict: null,
    raw: {},
    ...overrides,
  };
}

function facts(plutoCharacteristics: PlutoCharacteristics | null): BuildingFacts {
  return {
    bbl: "1008350041",
    bin: "1015862",
    address: "60 Centre Street, Manhattan",
    grossFloorAreaSqft: null,
    occupancyGroups: [],
    annualEmissionsTco2e: null,
    isLl97Covered: null,
    isArticle321: null,
    plutoCharacteristics,
    openViolations: [],
    provenance: [],
  };
}

describe("categorizeBuilding — PLUTO only (no Places key)", () => {
  test("an office building class maps to office", async () => {
    const category = await categorizeBuilding(facts(pluto({ buildingClass: "O4" })), {
      fetchPlace: null,
    });

    expect(category.broad).toBe("office");
    expect(category.specific).toBe("Office building");
    expect(category.confidence).toBe("medium");
    expect(category.sources[0]).toMatch(/PLUTO/);
  });

  test("a residential elevator building class maps to residential", async () => {
    const category = await categorizeBuilding(facts(pluto({ buildingClass: "D1" })), {
      fetchPlace: null,
    });

    expect(category.broad).toBe("residential");
    expect(category.specific).toMatch(/Elevator apartments/);
  });

  test("land use is the lower-confidence fallback when class is unknown", async () => {
    const category = await categorizeBuilding(
      facts(pluto({ buildingClass: null, landUse: "05" })),
      { fetchPlace: null },
    );

    expect(category.broad).toBe("commercial");
    expect(category.confidence).toBe("low");
  });

  test("no PLUTO and no Places yields an honest unknown", async () => {
    const category = await categorizeBuilding(facts(null), { fetchPlace: null });

    expect(category.broad).toBe("unknown");
    expect(category.confidence).toBe("low");
    expect(category.sources).toHaveLength(0);
  });
});

describe("categorizeBuilding — Google Places enrichment", () => {
  const courthouse: PlaceLookup = {
    primaryType: "courthouse",
    primaryTypeDisplay: "Courthouse",
    types: ["courthouse", "local_government_office"],
    name: "New York County Supreme Court",
  };

  test("Places gives the specific civic type and overrides the PLUTO label", async () => {
    // PLUTO would call it a government building; Places nails it as a courthouse.
    const category = await categorizeBuilding(facts(pluto({ buildingClass: "Y1" })), {
      fetchPlace: async () => courthouse,
    });

    expect(category.broad).toBe("civic_institutional");
    expect(category.specific).toBe("Courthouse");
    expect(category.placeName).toBe("New York County Supreme Court");
    expect(category.placeTypes).toContain("courthouse");
    expect(category.confidence).toBe("high");
    expect(category.sources).toContain("Google Places");
  });

  test("a Places failure falls back to PLUTO without throwing", async () => {
    const category = await categorizeBuilding(facts(pluto({ buildingClass: "O4" })), {
      fetchPlace: async () => {
        throw new Error("Places quota exceeded");
      },
    });

    expect(category.broad).toBe("office");
    expect(category.confidence).toBe("medium");
  });
});

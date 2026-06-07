import { describe, expect, test } from "vitest";
import { assessObligations } from "../src/obligations.ts";
import type { BuildingFacts } from "../src/types.ts";

// A covered, over-cap office (the 350 5th Ave shape used elsewhere) plus an
// on-record LL84 filing, so both the performance and procedural branches fire.
const coveredOffice: BuildingFacts = {
  bbl: "1008350041",
  bin: "1015862",
  address: "350 5 AVENUE, New York, NY, USA",
  grossFloorAreaSqft: 2_852_257,
  occupancyGroups: [{ group: "Office", sqft: 2_852_257 }],
  annualEmissionsTco2e: 16_678.22,
  isLl97Covered: true,
  isArticle321: false,
  plutoCharacteristics: null,
  infrastructureProfile: {
    hasLl84Filing: true,
    hasRecomputedEmissions: true,
    fuelTypes: ["natural_gas"],
    boilerRecords: [],
    buildJobFilings: [],
    electricalPermits: [],
    heatingFuel: "natural_gas",
    hasPV: false,
    boilerCount: 0,
    boilerCondition: null,
    recentHvacWork: false,
    efficiencyTier: "low",
  },
  openViolations: [],
  provenance: [],
};

describe("assessObligations", () => {
  test("an over-cap covered office gets a performance and a procedural obligation", () => {
    const { obligations } = assessObligations(coveredOffice);

    const ll97 = obligations.find(obligation => obligation.lawId === "ll97");
    const ll84 = obligations.find(obligation => obligation.lawId === "ll84");

    expect(ll97?.kind).toBe("performance");
    expect(ll84?.kind).toBe("procedural");
  });

  test("the LL97 performance obligation carries the engine's three periods and flags risk", () => {
    const ll97 = assessObligations(coveredOffice).obligations.find(
      obligation => obligation.lawId === "ll97",
    );

    expect(ll97?.kind).toBe("performance");
    if (ll97?.kind !== "performance") return;

    expect(ll97.periods).toHaveLength(3);
    // 2030-2034 is far over cap for this building, so it can't read satisfied.
    expect(ll97.status).not.toBe("satisfied");
    expect(ll97.findings.length).toBeGreaterThan(0);
  });

  test("an on-record LL84 filing reads satisfied with no recommendation", () => {
    const ll84 = assessObligations(coveredOffice).obligations.find(
      obligation => obligation.lawId === "ll84",
    );

    expect(ll84?.status).toBe("satisfied");
    expect(ll84?.recommendations).toHaveLength(0);
  });

  test("a missing LL84 filing reads due with a concrete next action", () => {
    const noFiling: BuildingFacts = {
      ...coveredOffice,
      infrastructureProfile: {
        ...coveredOffice.infrastructureProfile!,
        hasLl84Filing: false,
      },
    };

    const ll84 = assessObligations(noFiling).obligations.find(
      obligation => obligation.lawId === "ll84",
    );

    expect(ll84?.status).toBe("due");
    expect(ll84?.recommendations[0]).toMatch(/benchmarking/i);
  });

  test("LL97 with no emissions data degrades to an unknown obligation, not a guess", () => {
    const sparse: BuildingFacts = {
      ...coveredOffice,
      annualEmissionsTco2e: null,
      occupancyGroups: [],
    };

    const ll97 = assessObligations(sparse).obligations.find(
      obligation => obligation.lawId === "ll97",
    );

    expect(ll97?.kind).toBe("performance");
    if (ll97?.kind !== "performance") return;

    expect(ll97.status).toBe("unknown");
    expect(ll97.periods).toHaveLength(0);
  });

  test("a building covered by nothing modeled returns an explanatory note", () => {
    const tiny: BuildingFacts = {
      ...coveredOffice,
      grossFloorAreaSqft: 10_000,
      isLl97Covered: false,
    };

    const assessment = assessObligations(tiny);

    expect(assessment.obligations).toHaveLength(0);
    expect(assessment.notes[0]).toMatch(/no modeled law/i);
  });
});

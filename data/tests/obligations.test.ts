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
    ll84ReportingYear: 2025,
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

  const asOf = new Date("2026-06-06T00:00:00Z");

  test("a current LL84 filing reads satisfied with no recommendation", () => {
    const ll84 = assessObligations(coveredOffice, { asOf }).obligations.find(
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
        ll84ReportingYear: null,
      },
    };

    const ll84 = assessObligations(noFiling, { asOf }).obligations.find(
      obligation => obligation.lawId === "ll84",
    );

    expect(ll84?.status).toBe("due");
    expect(ll84?.recommendations[0]).toMatch(/benchmarking/i);
  });

  test("a stale LL84 filing reads at_risk", () => {
    const stale: BuildingFacts = {
      ...coveredOffice,
      infrastructureProfile: {
        ...coveredOffice.infrastructureProfile!,
        ll84ReportingYear: 2021,
      },
    };

    const ll84 = assessObligations(stale, { asOf }).obligations.find(
      obligation => obligation.lawId === "ll84",
    );

    expect(ll84?.status).toBe("at_risk");
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

  test("a small non-LL97 building still carries the universal gas-piping duty", () => {
    const tiny: BuildingFacts = {
      ...coveredOffice,
      grossFloorAreaSqft: 10_000,
      isLl97Covered: false,
    };

    const lawIds = assessObligations(tiny).obligations.map(obligation => obligation.lawId);

    // Under 25k sqft and not LL97-covered: no LL97/LL84/LL87, but LL152 binds.
    expect(lawIds).toContain("ll152");
    expect(lawIds).not.toContain("ll97");
    expect(lawIds).not.toContain("ll84");
  });
});

describe("LL88 and Article 321 analyzers", () => {
  const asOfLl88 = new Date("2026-06-06T00:00:00Z");

  test("LL88 binds a large building with a passed deadline and an LL97 cross-reference", () => {
    const ll88 = assessObligations(coveredOffice, { asOf: asOfLl88 }).obligations.find(
      obligation => obligation.lawId === "ll88",
    );

    expect(ll88?.kind).toBe("procedural");
    expect(ll88?.status).toBe("due");
    expect(ll88?.recommendations[0]).toMatch(/LL97/);
  });

  test("an Article 321 building gets the art321 analyzer, not standard LL97", () => {
    const affordable: BuildingFacts = { ...coveredOffice, isArticle321: true };

    const lawIds = assessObligations(affordable).obligations.map(o => o.lawId);

    expect(lawIds).toContain("art321");
    expect(lawIds).not.toContain("ll97");
  });

  test("an over-target Article 321 building reads at_risk and names the 2030 target", () => {
    const affordable: BuildingFacts = { ...coveredOffice, isArticle321: true };

    const art321 = assessObligations(affordable).obligations.find(o => o.lawId === "art321");

    expect(art321?.kind).toBe("performance");
    expect(art321?.status).toBe("at_risk");
    expect(art321?.findings.some(f => /2030 target/.test(f))).toBe(true);
  });
});

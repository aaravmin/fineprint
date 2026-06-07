import { describe, expect, test } from "vitest";
import {
  DEFAULT_MEASURES,
  optimizeArticle321,
  optimizeRetrofit,
} from "../src/retrofit.ts";
import type { BuildingInput } from "../src/index.ts";

// Big office over its 2030/2035 caps; concrete numbers come from the engine,
// the assertions here check the optimizer's selection logic.
const overCapOffice: BuildingInput = {
  grossFloorAreaSqft: 100_000,
  occupancyGroups: [{ group: "Office", sqft: 100_000 }],
  annualEmissionsTco2e: 1_500,
};

const wellUnderCap: BuildingInput = {
  ...overCapOffice,
  annualEmissionsTco2e: 1,
};

describe("optimizeRetrofit", () => {
  test("a compliant building's cheapest plan is to do nothing", () => {
    const assessment = optimizeRetrofit(wellUnderCap);

    expect(assessment.best.measureIds).toEqual([]);
    expect(assessment.best.totalCostUsd).toBe(0);
  });

  test("a free measure that cuts emissions is always taken when fines exist", () => {
    const freeMeasure = [
      {
        id: "free",
        name: "free fix",
        capexUsdPerSqft: 0,
        emissionsReductionFraction: 0.5,
        basis: "test",
      },
    ];

    const assessment = optimizeRetrofit(overCapOffice, freeMeasure);

    expect(assessment.best.measureIds).toContain("free");
  });

  test("the best plan never costs more than doing nothing", () => {
    const assessment = optimizeRetrofit(overCapOffice);

    expect(assessment.best.totalCostUsd).toBeLessThanOrEqual(
      assessment.doNothing.totalCostUsd,
    );
  });

  test("enumerates every subset of the default catalog", () => {
    const assessment = optimizeRetrofit(overCapOffice);

    expect(assessment.evaluatedSubsets).toBe(2 ** DEFAULT_MEASURES.length);
  });

  test("MACC point arithmetic is exact and the curve is sorted ascending", () => {
    const catalog = [
      {
        id: "cheap",
        name: "cheap",
        capexUsdPerSqft: 1,
        emissionsReductionFraction: 0.1,
        basis: "test",
      },
      {
        id: "dear",
        name: "dear",
        capexUsdPerSqft: 10,
        emissionsReductionFraction: 0.1,
        basis: "test",
      },
    ];

    const { macc } = optimizeRetrofit(
      { ...overCapOffice, annualEmissionsTco2e: 1_000 },
      catalog,
    );

    // capex 100k over (1000 * 0.1 = 100 tCO2e/yr * 16 horizon years) = $62.50/tCO2e
    expect(macc[0]).toMatchObject({ measureId: "cheap", usdPerTco2e: 62.5 });
    expect(macc[1].usdPerTco2e).toBe(625);
  });

  test("combined reductions are multiplicative, never additive", () => {
    const catalog = [
      {
        id: "a",
        name: "a",
        capexUsdPerSqft: 0,
        emissionsReductionFraction: 0.5,
        basis: "t",
      },
      {
        id: "b",
        name: "b",
        capexUsdPerSqft: 0,
        emissionsReductionFraction: 0.5,
        basis: "t",
      },
    ];

    const { best } = optimizeRetrofit(overCapOffice, catalog);

    // 1500 * 0.5 * 0.5 = 375, not 1500 - 750 - 750 = 0
    expect(best.projectedEmissionsTco2e).toBe(375);
  });

  test("rejects a catalog too large to enumerate", () => {
    const big = Array.from({ length: 13 }, (_, index) => ({
      id: `m${index}`,
      name: `m${index}`,
      capexUsdPerSqft: 1,
      emissionsReductionFraction: 0.01,
      basis: "t",
    }));

    expect(() => optimizeRetrofit(overCapOffice, big)).toThrow(/catalog/);
  });

  test("Article 321 buildings get a disclosure note", () => {
    const assessment = optimizeRetrofit({ ...overCapOffice, isArticle321: true });

    expect(assessment.notes.join(" ")).toMatch(/Article 321/);
  });
});

describe("optimizeArticle321", () => {
  test("a building already under its 2030 target needs no measures", () => {
    const assessment = optimizeArticle321(wellUnderCap);

    expect(assessment.alreadyUnderTarget).toBe(true);
    expect(assessment.cheapestCompliantPlan?.measureIds).toEqual([]);
    expect(assessment.cheapestCompliantPlan?.capexUsd).toBe(0);
  });

  test("an over-target building gets the cheapest measure set that clears the limit", () => {
    // The 100k-sqft office 2030 limit is ~269 tCO2e; 400 is over but reachable.
    const reachable: BuildingInput = { ...overCapOffice, annualEmissionsTco2e: 400 };
    const assessment = optimizeArticle321(reachable);

    expect(assessment.alreadyUnderTarget).toBe(false);
    expect(assessment.cheapestCompliantPlan).not.toBeNull();
    // Whatever set is chosen must actually clear the 2030 target.
    expect(assessment.cheapestCompliantPlan!.projectedEmissionsTco2e).toBeLessThanOrEqual(
      assessment.target2030Tco2e,
    );
  });

  test("no per-tonne fines: a building far over target may be unreachable by measures", () => {
    const wayOver: BuildingInput = { ...overCapOffice, annualEmissionsTco2e: 50_000 };
    const assessment = optimizeArticle321(wayOver);

    // The full catalog can't cut 50,000 tCO2e to the office 2030 limit, so the
    // prescribed-measures pathway is the route and the plan is null.
    expect(assessment.cheapestCompliantPlan).toBeNull();
    expect(assessment.notes.some(note => /prescribed/i.test(note))).toBe(true);
  });
});

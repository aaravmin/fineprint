import { describe, expect, test } from "vitest";
import {
  DEFAULT_MEASURES,
  optimizeArticle321,
  optimizeRetrofit,
  planForBudget,
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
    const big = Array.from({ length: 17 }, (_, index) => ({
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

describe("procedural penalty credit", () => {
  test("a credit can flip selection toward the measure that retires a filing", () => {
    // A compliant building gains nothing in fines from any measure, so the
    // only way a measure enters the plan is the procedural credit exceeding
    // its capex. 100,000 sqft x $0.01 = $1,000 capex vs a $1,500 credit.
    const cheapLighting = [
      {
        id: "led_cheap",
        name: "cheap lighting",
        capexUsdPerSqft: 0.01,
        emissionsReductionFraction: 0,
        basis: "test",
        satisfiesLaws: ["ll88"],
      },
    ];

    const without = optimizeRetrofit(wellUnderCap, cheapLighting);
    expect(without.best.measureIds).toEqual([]);

    const withCredit = optimizeRetrofit(wellUnderCap, cheapLighting, {
      proceduralPenaltySavingsByLaw: { ll88: 1_500 },
    });
    expect(withCredit.best.measureIds).toEqual(["led_cheap"]);
    expect(withCredit.best.proceduralCreditUsd).toBe(1_500);
    expect(withCredit.best.totalCostUsd).toBe(1_000 - 1_500);
    expect(withCredit.notes.some(note => /procedural/i.test(note))).toBe(true);
  });

  test("a law is credited once even when two chosen measures both satisfy it", () => {
    const pair = [
      {
        id: "a",
        name: "a",
        capexUsdPerSqft: 0,
        emissionsReductionFraction: 0.3,
        basis: "test",
        satisfiesLaws: ["ll88"],
      },
      {
        id: "b",
        name: "b",
        capexUsdPerSqft: 0,
        emissionsReductionFraction: 0.3,
        basis: "test",
        satisfiesLaws: ["ll88"],
      },
    ];

    const assessment = optimizeRetrofit(overCapOffice, pair, {
      proceduralPenaltySavingsByLaw: { ll88: 1_500 },
    });

    // Both free measures get taken for their emissions cuts; the ll88 credit
    // still lands exactly once.
    expect(assessment.best.measureIds.sort()).toEqual(["a", "b"]);
    expect(assessment.best.proceduralCreditUsd).toBe(1_500);
  });
});

describe("planForBudget", () => {
  test("a zero budget funds nothing and leaves emissions untouched", () => {
    const plan = planForBudget(overCapOffice, 0);

    expect(plan.measureIds).toEqual([]);
    expect(plan.capexUsd).toBe(0);
    expect(plan.projectedEmissionsTco2e).toBe(overCapOffice.annualEmissionsTco2e);
  });

  test("a budget below the cheapest measure still funds nothing", () => {
    const cheapestCapex = Math.min(
      ...DEFAULT_MEASURES.map(m => m.capexUsdPerSqft * overCapOffice.grossFloorAreaSqft),
    );
    const plan = planForBudget(overCapOffice, cheapestCapex - 1);

    expect(plan.measureIds).toEqual([]);
    expect(plan.capexUsd).toBe(0);
  });

  test("a negative budget is clamped to do-nothing rather than throwing", () => {
    const plan = planForBudget(overCapOffice, -50_000);

    expect(plan.capexUsd).toBe(0);
    expect(plan.measureIds).toEqual([]);
  });

  test("the chosen plan never spends more than the budget", () => {
    for (const budget of [0, 100_000, 350_000, 900_000, 2_000_000, 10_000_000]) {
      expect(planForBudget(overCapOffice, budget).capexUsd).toBeLessThanOrEqual(budget);
    }
  });

  test("more budget never leaves higher fines (monotonic in spend)", () => {
    const budgets = [0, 100_000, 300_000, 700_000, 1_500_000, 4_250_000];
    const fines = budgets.map(b => planForBudget(overCapOffice, b).horizonFinesUsd);

    for (let i = 1; i < fines.length; i++) {
      expect(fines[i]).toBeLessThanOrEqual(fines[i - 1]);
    }
  });

  test("an unbounded budget reaches at least the cost-optimal fine outcome", () => {
    const generous = planForBudget(overCapOffice, 1_000_000_000);
    const costOptimal = optimizeRetrofit(overCapOffice).best;

    // Minimizing fines with money to burn can only match or beat the plan that
    // also has to justify its capex.
    expect(generous.horizonFinesUsd).toBeLessThanOrEqual(costOptimal.horizonFinesUsd);
  });

  test("with money to burn it buys the cheapest subset that clears the fines", () => {
    // Two measures each cut emissions far below the cap on their own, so both
    // reach zero fines; the planner must prefer the cheaper one rather than
    // stacking spend that buys no further fine reduction.
    const measures = [
      {
        id: "cheap",
        name: "cheap deep cut",
        capexUsdPerSqft: 1,
        emissionsReductionFraction: 0.99,
        basis: "test",
      },
      {
        id: "expensive",
        name: "expensive deep cut",
        capexUsdPerSqft: 10,
        emissionsReductionFraction: 0.99,
        basis: "test",
      },
    ];

    const plan = planForBudget(overCapOffice, 1_000_000_000, measures);

    expect(plan.horizonFinesUsd).toBe(0);
    expect(plan.measureIds).toEqual(["cheap"]);
  });

  test("a compliant building invests nothing no matter how large the budget", () => {
    const plan = planForBudget(wellUnderCap, 5_000_000);

    expect(plan.measureIds).toEqual([]);
    expect(plan.capexUsd).toBe(0);
  });

  test("an Article 321 building has no modeled fine to spend against", () => {
    const plan = planForBudget(
      { ...overCapOffice, isArticle321: true },
      5_000_000,
    );

    // Article 321 faces flat penalties, not the $268/tCO2e fine the engine
    // models, so there is no fine for capex to chase — the plan stays empty.
    expect(plan.horizonFinesUsd).toBe(0);
    expect(plan.measureIds).toEqual([]);
  });
});

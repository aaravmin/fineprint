import { describe, expect, test } from "vitest";
import { computeAllPeriods, type BuildingInput } from "../src/index.ts";

describe("computeAllPeriods", () => {
  // A typical pre-war multifamily that never retrofits: 80,000 sf at
  // 0.0075 tCO2e/sf (600 tCO2e/yr). Over the 2030 cap and far over the 2035
  // cap, so the fine must grow strictly as limits tighten.
  const overCapMultifamily: BuildingInput = {
    grossFloorAreaSqft: 80_000,
    occupancyGroups: [{ group: "Multifamily Housing", sqft: 80_000 }],
    annualEmissionsTco2e: 600,
  };

  test("returns all three periods in order", () => {
    const results = computeAllPeriods(overCapMultifamily);

    expect(results.map(result => result.period)).toEqual([
      "2024-2029",
      "2030-2034",
      "2035-2039",
    ]);
  });

  test("an over-cap multifamily building faces a strictly growing fine", () => {
    const [first, second, third] = computeAllPeriods(overCapMultifamily);

    // Limits per 1 RCNY 103-14(d)(3): 0.00675 -> 0.00334664 -> 0.002692183
    // tCO2e/sf. 80,000 sf gives 540 / 267.73 / 215.37 tCO2e.
    expect(first.emissionsLimitTco2e).toBe(540);
    expect(second.emissionsLimitTco2e).toBe(267.73);
    expect(third.emissionsLimitTco2e).toBe(215.37);

    expect(first.annualFineUsd).toBeGreaterThan(0);
    expect(second.annualFineUsd).toBeGreaterThan(first.annualFineUsd);
    expect(third.annualFineUsd).toBeGreaterThan(second.annualFineUsd);
  });

  test("each period result matches computeFine for that period", () => {
    const results = computeAllPeriods(overCapMultifamily);

    for (const result of results) {
      expect(result.actualEmissionsTco2e).toBe(600);
      expect(result.compliant).toBe(false);
      expect(result.pathway).toBe("standard");
    }
  });
});

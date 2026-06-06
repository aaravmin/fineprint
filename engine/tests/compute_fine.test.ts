import { describe, expect, test } from "vitest";
import { computeFine, type BuildingInput } from "../src/index.ts";

function officeBuilding(overrides: Partial<BuildingInput> = {}): BuildingInput {
  return {
    grossFloorAreaSqft: 100_000,
    occupancyGroups: [{ group: "Office", sqft: 100_000 }],
    annualEmissionsTco2e: 500,
    ...overrides,
  };
}

describe("computeFine edge behavior", () => {
  test("a zero-sqft building has a zero limit and pays for every ton", () => {
    const result = computeFine(
      officeBuilding({
        grossFloorAreaSqft: 0,
        occupancyGroups: [{ group: "Office", sqft: 0 }],
        annualEmissionsTco2e: 10,
      }),
      "2024-2029",
    );

    expect(result.emissionsLimitTco2e).toBe(0);
    expect(result.overageTco2e).toBe(10);
    expect(result.annualFineUsd).toBe(2_680);
    expect(result.compliant).toBe(false);
  });

  test("a building exactly at its limit is compliant with no fine", () => {
    // Office factor 0.00758 x 100,000 sf = 758 tCO2e exactly.
    const result = computeFine(
      officeBuilding({ annualEmissionsTco2e: 758 }),
      "2024-2029",
    );

    expect(result.overageTco2e).toBe(0);
    expect(result.annualFineUsd).toBe(0);
    expect(result.compliant).toBe(true);
  });

  test("a tiny overage produces a sub-dollar fine rounded to the cent", () => {
    // 0.001 tCO2e over: 0.001 x $268 = $0.268, rounds to 27 cents.
    const result = computeFine(
      officeBuilding({ annualEmissionsTco2e: 758.001 }),
      "2024-2029",
    );

    expect(result.annualFineUsd).toBe(0.27);
    expect(result.compliant).toBe(false);
  });

  test("zero emissions in a zero-sqft building is compliant", () => {
    const result = computeFine(
      officeBuilding({
        grossFloorAreaSqft: 0,
        occupancyGroups: [{ group: "Office", sqft: 0 }],
        annualEmissionsTco2e: 0,
      }),
      "2024-2029",
    );

    expect(result.annualFineUsd).toBe(0);
    expect(result.compliant).toBe(true);
  });

  test("a letter group in 2035-2039 falls back to its proxy ESPM type with a note", () => {
    const result = computeFine(
      officeBuilding({ occupancyGroups: [{ group: "R-2", sqft: 100_000 }] }),
      "2035-2039",
    );

    // R-2 proxies to Multifamily Housing: 0.002692183 x 100,000 sf = 269.22.
    expect(result.emissionsLimitTco2e).toBe(269.22);
    expect(result.notes.join(" ")).toMatch(/unofficial mapping/);
  });

  test("statutory occupancy-group letters work and carry an estimate note", () => {
    const result = computeFine(
      officeBuilding({ occupancyGroups: [{ group: "R-2", sqft: 100_000 }] }),
      "2024-2029",
    );

    // R-2 statutory coefficient 0.00675 x 100,000 sf = 675 tCO2e.
    expect(result.emissionsLimitTco2e).toBe(675);
    expect(result.notes.length).toBeGreaterThan(0);
  });
});

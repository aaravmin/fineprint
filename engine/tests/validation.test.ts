import { describe, expect, test } from "vitest";
import { computeAllPeriods, computeFine, type BuildingInput } from "../src/index.ts";

function building(overrides: Partial<BuildingInput> = {}): BuildingInput {
  return {
    grossFloorAreaSqft: 50_000,
    occupancyGroups: [{ group: "Office", sqft: 50_000 }],
    annualEmissionsTco2e: 300,
    ...overrides,
  };
}

describe("input validation", () => {
  test("rejects a negative gross floor area", () => {
    expect(() => computeFine(building({ grossFloorAreaSqft: -1 }), "2024-2029")).toThrow(
      /gross floor area/i,
    );
  });

  test("rejects a negative occupancy-group area", () => {
    expect(() =>
      computeFine(
        building({ occupancyGroups: [{ group: "Office", sqft: -100 }] }),
        "2024-2029",
      ),
    ).toThrow(/Office.*-100/);
  });

  test("rejects negative annual emissions", () => {
    expect(() =>
      computeFine(building({ annualEmissionsTco2e: -5 }), "2024-2029"),
    ).toThrow(/emissions/i);
  });

  test("rejects occupancy areas that exceed the gross floor area", () => {
    expect(() =>
      computeFine(
        building({
          grossFloorAreaSqft: 50_000,
          occupancyGroups: [
            { group: "Office", sqft: 40_000 },
            { group: "Retail Store", sqft: 20_000 },
          ],
        }),
        "2024-2029",
      ),
    ).toThrow(/60,000.*50,000/);
  });

  test("rejects non-finite numbers", () => {
    expect(() =>
      computeFine(building({ annualEmissionsTco2e: NaN }), "2024-2029"),
    ).toThrow(/emissions/i);
  });

  test("an unknown occupancy group lists the valid options", () => {
    expect(() =>
      computeFine(
        building({ occupancyGroups: [{ group: "Z-9", sqft: 50_000 }] }),
        "2024-2029",
      ),
    ).toThrow(/Z-9.*Multifamily Housing/s);
  });

  test("rejects a building with no occupancy groups", () => {
    expect(() => computeFine(building({ occupancyGroups: [] }), "2024-2029")).toThrow(
      /occupancy group/i,
    );
  });

  test("rejects an unknown period", () => {
    expect(() => computeFine(building(), "2020-2023" as never)).toThrow(/2020-2023/);
  });

  test("computeAllPeriods validates too", () => {
    expect(() => computeAllPeriods(building({ grossFloorAreaSqft: -1 }))).toThrow(
      /gross floor area/i,
    );
  });
});

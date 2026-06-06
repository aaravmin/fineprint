import { describe, expect, test } from "vitest";
import { computeFine, type BuildingInput } from "../src/index.ts";

// Article 321 (rent-regulated / affordable pathway): these buildings are not
// subject to the $268/tCO2e penalty. They comply once, by either implementing
// the 13 prescribed energy conservation measures (Admin Code 28-321.2.2) or
// showing 2024 emissions already under their 2030 limit (28-321.2.1). The
// engine only honors the flag — whether a building qualifies is decided
// upstream in the data branch.
describe("Article 321 pathway", () => {
  const rentRegulatedBuilding: BuildingInput = {
    grossFloorAreaSqft: 80_000,
    occupancyGroups: [{ group: "Multifamily Housing", sqft: 80_000 }],
    annualEmissionsTco2e: 600,
    isArticle321: true,
  };

  test("an Article 321 building gets no dollar fine even when over the cap", () => {
    const result = computeFine(rentRegulatedBuilding, "2024-2029");

    expect(result.pathway).toBe("article321");
    expect(result.annualFineUsd).toBe(0);
    expect(result.overageTco2e).toBe(0);
    expect(result.compliant).toBe(true);
  });

  test("shows the building's 2030 limit as the future target", () => {
    const result = computeFine(rentRegulatedBuilding, "2024-2029");

    // 2030-2034 Multifamily Housing factor 0.00334664 x 80,000 sf = 267.73.
    expect(result.emissionsLimitTco2e).toBe(267.73);
    expect(result.notes.join(" ")).toMatch(/energy conservation measures/i);
    expect(result.notes.join(" ")).toMatch(/2030/);
  });

  test("the same building without the flag goes down the standard pathway", () => {
    const result = computeFine(
      { ...rentRegulatedBuilding, isArticle321: false },
      "2024-2029",
    );

    expect(result.pathway).toBe("standard");
    expect(result.annualFineUsd).toBeGreaterThan(0);
    expect(result.compliant).toBe(false);
  });
});

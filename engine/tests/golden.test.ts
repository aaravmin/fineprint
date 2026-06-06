import { describe, expect, test } from "vitest";
import { computeFine, type BuildingInput } from "../src/index.ts";

// Golden test 1: the only official end-to-end worked example DOB has published.
//
// Source: NYC DOB, "Local Law 97: Calculating Building Emissions & Emission
// Limits" (June 26, 2024), slide 25 "Sample Calculations".
// https://www.nyc.gov/assets/buildings/pdf/ll97_emissions.pdf
//
// A 45,000 sf multifamily/commercial mixed-use building, split across four
// ESPM property types. DOB's published numbers: emissions limit 302.41 tCO2e,
// actual 2024 emissions 287.00 tCO2e, compliant, no penalty.
describe("DOB June 2024 worked example (mixed-use, compliant)", () => {
  const dobExampleBuilding: BuildingInput = {
    grossFloorAreaSqft: 45_000,
    occupancyGroups: [
      { group: "Multifamily Housing", sqft: 40_000 },
      { group: "Personal Services (Health/Beauty, Dry Cleaning, etc.)", sqft: 1_900 },
      { group: "Repair Services (Vehicle, Shoe, Locksmith, etc.)", sqft: 600 },
      { group: "Retail Store", sqft: 2_500 },
    ],
    annualEmissionsTco2e: 287.0,
  };

  test("matches DOB's published limit, overage, and fine exactly", () => {
    const result = computeFine(dobExampleBuilding, "2024-2029");

    expect(result.emissionsLimitTco2e).toBe(302.41);
    expect(result.actualEmissionsTco2e).toBe(287.0);
    expect(result.overageTco2e).toBe(0);
    expect(result.annualFineUsd).toBe(0);
    expect(result.compliant).toBe(true);
    expect(result.pathway).toBe("standard");
  });
});

// Golden test 2: the penalty formula, checked against the rule text.
//
// No official DOB document publishes a worked example with a nonzero dollar
// penalty, so this test derives one directly from the penalty clause:
//
//   "Such penalty shall be an amount equal to the difference between the
//    building emissions limit established for a calendar year and the actual
//    emissions reported for such calendar year in the building emissions
//    report, multiplied by $268."
//   — 1 RCNY 103-14(h), https://www.nyc.gov/assets/buildings/rules/1_RCNY_103-14.pdf
//
// A 100,000 sf office: limit = 0.00758 tCO2e/sf x 100,000 sf = 758.00 tCO2e
// (ESPM "Office" factor, 1 RCNY 103-14(d)(3)(i)). Actual 858.00 tCO2e gives a
// 100.00 tCO2e overage and a penalty of 100 x $268 = $26,800.
describe("penalty formula from 1 RCNY 103-14(h)", () => {
  const overCapOffice: BuildingInput = {
    grossFloorAreaSqft: 100_000,
    occupancyGroups: [{ group: "Office", sqft: 100_000 }],
    annualEmissionsTco2e: 858.0,
  };

  test("charges $268 per tCO2e over the limit", () => {
    const result = computeFine(overCapOffice, "2024-2029");

    expect(result.emissionsLimitTco2e).toBe(758.0);
    expect(result.overageTco2e).toBe(100.0);
    expect(result.annualFineUsd).toBe(26_800);
    expect(result.compliant).toBe(false);
    expect(result.pathway).toBe("standard");
  });
});

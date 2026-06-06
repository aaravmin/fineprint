import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ESPM_FACTORS_TCO2E_PER_SQFT } from "../../engine/src/constants.ts";
import { parseLl84Rows } from "../src/ll84.ts";

// Real LL84 disclosure rows (Socrata 5zyy-y8am) recorded 2026-06-06.
// The Empire State Building's 2024 filing: 2,852,257 sqft across eight
// property uses, 16,678.22 tCO2e location-based GHG.
const esbRows = JSON.parse(
  readFileSync(new URL("./fixtures/ll84-1008350041.json", import.meta.url), "utf8"),
);
const noFiling = JSON.parse(
  readFileSync(new URL("./fixtures/ll84-no-filing.json", import.meta.url), "utf8"),
);

describe("parseLl84Rows", () => {
  test("extracts the building facts from the latest filing", () => {
    const facts = parseLl84Rows(esbRows, "1008350041");

    expect(facts).not.toBeNull();
    expect(facts!.bbl).toBe("1008350041");
    expect(facts!.reportingYear).toBe(2024);
    expect(facts!.grossFloorAreaSqft).toBe(2_852_257);
    expect(facts!.annualEmissionsTco2e).toBe(16_678.22);
    expect(facts!.reportedAddress).toMatch(/Empire State/i);
  });

  test("splits the property uses with their square footage", () => {
    const facts = parseLl84Rows(esbRows, "1008350041");
    const office = facts!.occupancyGroups.find(use => use.group === "Office");

    expect(facts!.occupancyGroups).toHaveLength(8);
    expect(office?.sqft).toBe(2_692_475.1);
  });

  test("maps LL84 use names onto the engine's ESPM vocabulary", () => {
    const facts = parseLl84Rows(esbRows, "1008350041");

    // LL84 says "Community Center and Social Meeting Hall"; the penalty rule
    // (and therefore the engine) knows it as "Social/Meeting Hall".
    const meetingHall = facts!.occupancyGroups.find(
      use => use.group === "Social/Meeting Hall",
    );
    expect(meetingHall?.sqft).toBe(56_815);

    for (const use of facts!.occupancyGroups) {
      expect(
        ESPM_FACTORS_TCO2E_PER_SQFT[use.group],
        `"${use.group}" is not a name the engine accepts`,
      ).toBeDefined();
    }
  });

  test("a building with no filing returns null, not a guess", () => {
    expect(parseLl84Rows(noFiling, "9999999999")).toBeNull();
  });

  test("'Not Available' values become null, never NaN", () => {
    const rows = structuredClone(esbRows);
    rows[0].total_location_based_ghg = "Not Available";
    rows[0].property_gfa_calculated = "Not Available";
    rows[0].property_gfa_self_reported = "Not Available";

    const facts = parseLl84Rows(rows, "1008350041");

    expect(facts!.annualEmissionsTco2e).toBeNull();
    expect(facts!.grossFloorAreaSqft).toBeNull();
  });
});

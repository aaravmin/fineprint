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

  // The dataset-wide vocabulary sweep (2026-06-06, 3,000 filings) found 16
  // use names the rule's factor table doesn't list. Renames map exactly,
  // near-misses map to the closest bucket and are recorded, and types with
  // no defensible factor are excluded from the engine's input — visibly.
  test("renamed ESPM types map to the rule's name silently", () => {
    const rows = structuredClone(esbRows);
    rows[0].list_of_all_property_use = "Senior Living Community (80000.0)";

    const facts = parseLl84Rows(rows, "1008350041");

    expect(facts!.occupancyGroups).toEqual([
      { group: "Senior Care Community", sqft: 80_000 },
    ]);
    expect(facts!.proxiedUses).toEqual([]);
  });

  test("types missing from the rule map to the nearest bucket and say so", () => {
    const rows = structuredClone(esbRows);
    rows[0].list_of_all_property_use = "Fire Station (12000.0), Bar/Nightclub (3000.0)";

    const facts = parseLl84Rows(rows, "1008350041");

    expect(facts!.occupancyGroups).toEqual([
      { group: "Other - Public Services", sqft: 12_000 },
      { group: "Other - Restaurant/Bar", sqft: 3_000 },
    ]);
    expect(facts!.proxiedUses).toEqual([
      { from: "Fire Station", to: "Other - Public Services" },
      { from: "Bar/Nightclub", to: "Other - Restaurant/Bar" },
    ]);
  });

  test("unmappable types are excluded from engine input, not guessed", () => {
    const rows = structuredClone(esbRows);
    rows[0].list_of_all_property_use = "Office (90000.0), Other (10000.0)";

    const facts = parseLl84Rows(rows, "1008350041");

    expect(facts!.occupancyGroups).toEqual([{ group: "Office", sqft: 90_000 }]);
    expect(facts!.unmappedUses).toEqual([{ group: "Other", sqft: 10_000 }]);
  });

  // ESPM's "location-based GHG" uses national eGRID factors; DOB prices fuels
  // with the statute's own coefficients (Admin Code 28-320.3.1.1, echoed in
  // 1 RCNY 103-14(d)(3)). The parser recomputes emissions the DOB way from
  // the filing's fuel columns. For the ESB fixture: natural gas 5,469,879.2
  // kBtu x 0.00005311 + district steam 64,363,489.2 kBtu x 0.00004493 +
  // grid electricity 30,849,800.6 kWh x 0.000288962 = 12,096.78 tCO2e —
  // a 27% lower figure than the 16,678.22 location-based number.
  test("recomputes emissions with the statute's fuel coefficients", () => {
    const facts = parseLl84Rows(esbRows, "1008350041");

    expect(facts!.recomputedEmissionsTco2e).toBeCloseTo(12_096.78, 1);
    expect(facts!.annualEmissionsTco2e).toBe(16_678.22);
    expect(facts!.unpriceableFuels).toEqual([]);
  });

  test("a fuel with no verified coefficient blocks the recompute, visibly", () => {
    const rows = structuredClone(esbRows);
    rows[0].fuel_oil_5_6_use_kbtu = "100000";

    const facts = parseLl84Rows(rows, "1008350041");

    expect(facts!.recomputedEmissionsTco2e).toBeNull();
    expect(facts!.unpriceableFuels).toEqual(["fuel_oil_5_6_use_kbtu"]);
  });

  test("a campus year with parent and child rows keeps the largest filing", () => {
    const rows = structuredClone(esbRows);
    const childRow = structuredClone(esbRows[0]);
    childRow.property_gfa_calculated = "150000";
    childRow.list_of_all_property_use = "Office (150000.0)";
    rows.unshift(childRow);

    const facts = parseLl84Rows(rows, "1008350041");

    expect(facts!.grossFloorAreaSqft).toBe(2_852_257);
  });
});

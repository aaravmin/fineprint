import { describe, expect, test } from "vitest";
import { projectFines, renderCliffTable } from "../src/projections.ts";
import type { DraftInput } from "../src/policies/types.ts";

// Engine projections for drafts: DraftInput -> engine BuildingInput -> all
// three compliance periods. The engine does every calculation; this module
// only converts and formats. Numbers below cross-check the live pipeline:
// the Empire State Building at its recomputed 12,096.78 tCO2e.
function esbInput(overrides: Partial<DraftInput> = {}): DraftInput {
  return {
    title: "LL97 — Building Emissions Cap — 350 5 AVENUE",
    kind: "emissions_fine_analysis",
    lawId: "ll97",
    address: "350 5 AVENUE, New York, NY, USA",
    sqft: 2_852_257,
    isAffordable: false,
    fineEstimateUsd: 0,
    deadline: undefined,
    bbl: "1008350041",
    annualEmissionsTco2e: 12_096.78,
    uses: [
      { group: "Office", sqft: 2_692_475.1 },
      { group: "Personal Services (Health/Beauty, Dry Cleaning, etc.)", sqft: 5_422 },
      { group: "Restaurant", sqft: 50_021 },
      { group: "Other - Technology/Science", sqft: 19_276 },
      { group: "Social/Meeting Hall", sqft: 56_815 },
      { group: "Retail Store", sqft: 10_901.9 },
      { group: "Fitness Center/Health Club/Gym", sqft: 15_972 },
      { group: "Mailing Center/Post Office", sqft: 1_374 },
    ],
    ll97Covered: true,
    provenance: [],
    ...overrides,
  };
}

describe("projectFines", () => {
  test("computes all three periods through the real engine", () => {
    const projections = projectFines(esbInput());

    expect(projections).not.toBeNull();
    expect(projections!.map(result => result.period)).toEqual([
      "2024-2029",
      "2030-2034",
      "2035-2039",
    ]);

    // Compliant today, seven figures at the cliff — the live-verified shape.
    expect(projections![0].annualFineUsd).toBe(0);
    expect(projections![1].annualFineUsd).toBeGreaterThan(1_000_000);
    expect(projections![2].annualFineUsd).toBeGreaterThan(projections![1].annualFineUsd);
  });

  test("missing emissions or uses mean no projections, not made-up ones", () => {
    expect(projectFines(esbInput({ annualEmissionsTco2e: undefined }))).toBeNull();
    expect(projectFines(esbInput({ uses: [] }))).toBeNull();
  });

  test("the affordable flag routes through the Article 321 pathway", () => {
    const projections = projectFines(esbInput({ isAffordable: true }));

    expect(projections![0].pathway).toBe("article321");
    expect(projections![0].annualFineUsd).toBe(0);
  });
});

describe("renderCliffTable", () => {
  test("renders one line per period with limit, overage, and dollars", () => {
    const table = renderCliffTable(projectFines(esbInput())!);

    expect(table).toMatch(/2024-2029.*\$0/);
    expect(table).toMatch(/2030-2034.*\$1,/);
    expect(table).toMatch(/2035-2039/);
    expect(table).toMatch(/tCO2e/);
  });
});

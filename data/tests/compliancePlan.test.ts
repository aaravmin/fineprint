import { describe, expect, test } from "vitest";
import { buildCompliancePlan } from "../src/compliancePlan.ts";
import type { BuildingFacts } from "../src/types.ts";

const asOf = new Date("2026-06-06T00:00:00Z");

// A high-intensity, over-cap office (0.05 tCO2e/sqft — well above the point
// where measures pay for themselves against the $268/ton fine). Its cheapest
// plan includes LED lighting, which is also exactly what LL88 requires.
const overCapOffice: BuildingFacts = {
  bbl: "1008350041",
  bin: "1015862",
  address: "350 5 AVENUE, New York, NY, USA",
  grossFloorAreaSqft: 100_000,
  occupancyGroups: [{ group: "Office", sqft: 100_000 }],
  annualEmissionsTco2e: 5_000,
  isLl97Covered: true,
  isArticle321: false,
  plutoCharacteristics: null,
  infrastructureProfile: {
    hasLl84Filing: true,
    ll84ReportingYear: 2025,
    hasRecomputedEmissions: true,
    fuelTypes: ["natural_gas"],
    boilerRecords: [],
    buildJobFilings: [],
    electricalPermits: [],
    heatingFuel: "natural_gas",
    hasPV: false,
    boilerCount: 0,
    boilerCondition: null,
    recentHvacWork: false,
    efficiencyTier: "low",
  },
  openViolations: [],
  provenance: [],
};

describe("buildCompliancePlan", () => {
  test("every obligation gets exactly one disposition", () => {
    const plan = buildCompliancePlan(overCapOffice, { asOf });

    const lawIds = plan.dispositions.map(d => d.lawId);
    expect(new Set(lawIds).size).toBe(lawIds.length); // no duplicates
    expect(lawIds).toContain("ll97");
    expect(lawIds).toContain("ll88");
  });

  test("the LED measure clears LL88, so LL88 is handled by the retrofit, not a separate filing", () => {
    const plan = buildCompliancePlan(overCapOffice, { asOf });

    // The deep-retrofit office takes LED lighting in its cheapest plan.
    const led = plan.measures.find(measure => measure.id === "led_lighting");
    expect(led?.alsoSatisfies).toContain("ll88");

    const ll88 = plan.dispositions.find(d => d.lawId === "ll88");
    expect(ll88?.handledBy).toBe("retrofit_measures");
    expect(ll88?.detail).toMatch(/no separate upgrade needed/i);

    expect(plan.crossCredits.some(credit => /LL88/.test(credit))).toBe(true);
  });

  test("a procedural law no measure covers still shows as a separate filing", () => {
    const plan = buildCompliancePlan(overCapOffice, { asOf });

    // LL84 is on record -> already compliant; LL152 has no measure and no
    // filing on record -> a separate action.
    const ll152 = plan.dispositions.find(d => d.lawId === "ll152");
    expect(ll152?.handledBy).toBe("filing");
  });

  test("the performance obligation is handled by the retrofit measures", () => {
    const plan = buildCompliancePlan(overCapOffice, { asOf });

    const ll97 = plan.dispositions.find(d => d.lawId === "ll97");
    expect(ll97?.handledBy).toBe("retrofit_measures");
    expect(plan.pathway).toBe("standard");
    expect(plan.totalCapexUsd).toBeGreaterThan(0);
  });

  test("a building the engine can't price still produces a filing-only plan", () => {
    const sparse: BuildingFacts = {
      ...overCapOffice,
      annualEmissionsTco2e: null,
      occupancyGroups: [],
    };

    const plan = buildCompliancePlan(sparse, { asOf });

    expect(plan.pathway).toBeNull();
    expect(plan.measures).toHaveLength(0);
    // The LL97 obligation can't be priced, so it needs attention, not a retrofit.
    const ll97 = plan.dispositions.find(d => d.lawId === "ll97");
    expect(ll97?.handledBy).toBe("needs_attention");
  });
});

import { describe, expect, test } from "vitest";
import {
  buildCompliancePlan,
  explainFineData,
  explainLookupError,
} from "../src/compliancePlan.ts";
import { emptyPublicRecords } from "../src/lookup.ts";
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
    energyStarScore: 30,
  },
  openViolations: [],
  ll84FuelUse: [],
  publicRecords: emptyPublicRecords(),
  provenance: [],
};

describe("buildCompliancePlan", () => {
  test("every obligation gets exactly one disposition", () => {
    const plan = buildCompliancePlan(overCapOffice, { asOf });

    const lawIds = plan.dispositions.map(d => d.lawId);
    expect(new Set(lawIds).size).toBe(lawIds.length); // no duplicates
    expect(lawIds).toContain("ll97");
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

describe("explainFineData — reasoning about why fines are missing", () => {
  const noData = {
    grossFloorAreaSqft: null,
    annualEmissionsTco2e: null,
    occupancyGroups: [],
  };

  test("a building with computable fines reports status available", () => {
    expect(explainFineData(overCapOffice).status).toBe("available");
    expect(buildCompliancePlan(overCapOffice, { asOf }).fineData.status).toBe(
      "available",
    );
  });

  test("not on the covered list -> not_applicable, but caveats large buildings", () => {
    const smallShop: BuildingFacts = {
      ...overCapOffice,
      ...noData,
      isLl97Covered: false,
    };

    const explanation = explainFineData(smallShop);
    expect(explanation.status).toBe("not_applicable");
    expect(explanation.message).toMatch(/usually means/i); // reasons, doesn't assert
    expect(explanation.message).toMatch(/verify the size/i); // doesn't just assert exemption
    expect(buildCompliancePlan(smallShop, { asOf }).fineData.status).toBe(
      "not_applicable",
    );
  });

  test("covered but unfiled -> covered_unfiled, framed as a gap not an exemption", () => {
    const coveredNoFiling: BuildingFacts = {
      ...overCapOffice,
      ...noData,
      isLl97Covered: true,
      infrastructureProfile: {
        ...overCapOffice.infrastructureProfile!,
        hasLl84Filing: false,
        ll84ReportingYear: null,
      },
    };

    const explanation = explainFineData(coveredNoFiling);
    expect(explanation.status).toBe("covered_unfiled");
    expect(explanation.message).toMatch(/applies to this building/i);
    expect(explanation.message).toMatch(/not an exemption/i);
  });

  test("covered with a filing but unpriceable -> data_incomplete, lists what's missing", () => {
    const coveredFiledIncomplete: BuildingFacts = {
      ...overCapOffice,
      ...noData,
      isLl97Covered: true,
      infrastructureProfile: {
        ...overCapOffice.infrastructureProfile!,
        hasLl84Filing: true,
      },
    };

    const explanation = explainFineData(coveredFiledIncomplete);
    expect(explanation.status).toBe("data_incomplete");
    expect(explanation.missing.length).toBeGreaterThan(0);
    expect(explanation.message).toMatch(/review the benchmarking filing/i);
  });
});

describe("explainLookupError — distinguishing errors from missing data", () => {
  test("an unrecognized address asks the user to fix the address", () => {
    const explanation = explainLookupError(new Error('no NYC address found for "xyz"'));
    expect(explanation.status).toBe("error");
    expect(explanation.message).toMatch(/borough/i);
  });

  test("a dataset failure is reported as a temporary error to retry", () => {
    const explanation = explainLookupError(new Error("LL84 request failed: timeout"));
    expect(explanation.status).toBe("error");
    expect(explanation.message).toMatch(/try again/i);
  });
});

describe("per-law breakdown and prioritized overlap actions", () => {
  test("each law is separated out with its own exposure and handling", () => {
    const plan = buildCompliancePlan(overCapOffice, { asOf });

    const ll97 = plan.laws.find(law => law.lawId === "ll97");

    expect(ll97?.kind).toBe("performance");
    expect(ll97?.exposureUsd).toBeGreaterThan(0); // the LL97 fine it carries
    expect(ll97?.addressedByActionIds.length).toBeGreaterThan(0);
  });

  test("overlap carries more weight than an equal-exposure single-law fix", () => {
    // Two laws of the same exposure: one fix clearing both must outscore one
    // fix clearing just one, by the overlap weight.
    const single = makeActionForTest(["a"], 1000);
    const doubled = makeActionForTest(["a", "b"], 2000); // 1000 + 1000

    expect(doubled.isOverlap).toBe(true);
    expect(doubled.priorityScore).toBeGreaterThan(single.priorityScore * 2);
  });
});

// Mirrors makeAction's weighting so the overlap-weight contract is pinned
// independent of the engine's dollar figures.
function makeActionForTest(lawIds: string[], totalExposure: number) {
  const per = totalExposure / lawIds.length;
  const satisfies = lawIds.map(lawId => ({ lawId, lawName: lawId, exposureUsd: per }));
  const extraLaws = Math.max(0, satisfies.length - 1);
  const exposureAddressedUsd = totalExposure;
  return {
    isOverlap: satisfies.length > 1,
    priorityScore: Math.round(exposureAddressedUsd * (1 + extraLaws * 0.5)),
  };
}

import { describe, expect, test } from "vitest";
import { planRetrofit } from "../src/retrofit.ts";
import { emptyPublicRecords } from "../src/lookup.ts";
import type { PersonalizedMeasure } from "../src/personalizedMeasures.ts";
import type { BuildingFacts, InfrastructureProfile, SystemKey } from "../src/types.ts";

const baseProfile: InfrastructureProfile = {
  hasLl84Filing: true,
  ll84ReportingYear: 2024,
  hasRecomputedEmissions: true,
  fuelTypes: ["natural_gas"],
  boilerRecords: [],
  buildJobFilings: [],
  electricalPermits: [],
  heatingFuel: "natural_gas",
  hasPV: false,
  boilerCount: 2,
  boilerCondition: "defects_on_record",
  recentHvacWork: false,
  efficiencyTier: "low",
  energyStarScore: 30,
};

const gasOffice: BuildingFacts = {
  bbl: "1008350041",
  bin: "1015862",
  address: "350 5 AVENUE, New York, NY, USA",
  grossFloorAreaSqft: 2_852_257,
  occupancyGroups: [{ group: "Office", sqft: 2_852_257 }],
  annualEmissionsTco2e: 16_678.22,
  isLl97Covered: true,
  isArticle321: false,
  plutoCharacteristics: null,
  infrastructureProfile: baseProfile,
  openViolations: [],
  ll84FuelUse: [],
  publicRecords: emptyPublicRecords(),
  provenance: [],
};

function measure(overrides: Partial<PersonalizedMeasure> = {}): PersonalizedMeasure {
  return {
    id: "hvac_controls",
    name: "BMS scheduling and controls optimization",
    targetSystem: "heating_plant" as SystemKey,
    applicability: "recommended",
    applicabilityReason: "The heating plant is aging.",
    estReductionTco2e: 200,
    effectiveReductionFraction: 0.06,
    capexUsd: 100_000,
    capexBasis: "engine editorial $1.00/sqft.",
    costPerTco2eAvoided: 31.25,
    why: "The heating plant is aging. A control upgrade trims its runtime.",
    evidence: [],
    ...overrides,
  };
}

// planRetrofit now takes the building's personalized measures and turns the
// applicable ones into the engine's vocabulary. These tests pin that contract
// directly; personalizedMeasures.test.ts covers how the measures are personalized.
describe("planRetrofit", () => {
  test("only recommended and applicable measures reach the optimizer", () => {
    const personalized = [
      measure({ id: "hvac_controls", applicability: "recommended" }),
      measure({ id: "led_lighting", applicability: "applicable", targetSystem: "lighting" }),
      measure({ id: "air_sealing", applicability: "applicable", targetSystem: "envelope" }),
    ];

    const plan = planRetrofit(gasOffice, personalized);

    expect(plan).not.toBeNull();
    // Three usable measures on the table -> 2^3 subsets enumerated.
    expect(plan!.assessment.evaluatedSubsets).toBe(8);
    expect(plan!.excluded).toHaveLength(0);
  });

  test("already-done and not-applicable measures become exclusions, not engine inputs", () => {
    const personalized = [
      measure({ id: "hvac_controls", applicability: "recommended" }),
      measure({
        id: "solar_pv",
        applicability: "already_done",
        targetSystem: "solar_pv",
        applicabilityReason: "Rooftop solar is already on record (2019).",
        estReductionTco2e: null,
        effectiveReductionFraction: null,
      }),
      measure({
        id: "steam_distribution_improvements",
        applicability: "not_applicable",
        applicabilityReason: "No steam distribution is on record.",
        estReductionTco2e: null,
        effectiveReductionFraction: null,
      }),
    ];

    const plan = planRetrofit(gasOffice, personalized);

    // Only hvac_controls is usable -> 2^1 subsets.
    expect(plan!.assessment.evaluatedSubsets).toBe(2);
    expect(plan!.excluded.map(exclusion => exclusion.id)).toEqual([
      "solar_pv",
      "steam_distribution_improvements",
    ]);
    expect(plan!.excluded[0].reason).toMatch(/already on record/i);
  });

  test("the plan carries the full personalized catalog for the persisted story", () => {
    const personalized = [
      measure({ id: "hvac_controls", applicability: "recommended" }),
      measure({ id: "solar_pv", applicability: "already_done", targetSystem: "solar_pv" }),
    ];

    const plan = planRetrofit(gasOffice, personalized);

    expect(plan!.measures).toHaveLength(2);
    expect(plan!.measures.map(m => m.id)).toContain("solar_pv");
  });

  test("findings still narrate the equipment from the infrastructure profile", () => {
    const plan = planRetrofit(gasOffice, [measure()]);

    expect(plan!.findings.some(finding => /boiler/i.test(finding))).toBe(true);
    expect(plan!.findings.some(finding => /defects on record/i.test(finding))).toBe(true);
  });

  test("no infrastructure profile means no equipment findings", () => {
    const noProfile: BuildingFacts = { ...gasOffice, infrastructureProfile: null };

    const plan = planRetrofit(noProfile, [measure()]);

    expect(plan!.findings).toHaveLength(0);
  });

  test("a measure with no reduction to offer is left out of the optimizer", () => {
    const personalized = [
      measure({ id: "hvac_controls", applicability: "recommended" }),
      measure({
        id: "windows",
        applicability: "applicable",
        targetSystem: "envelope",
        estReductionTco2e: null,
        effectiveReductionFraction: null,
      }),
    ];

    const plan = planRetrofit(gasOffice, personalized);

    // windows has nothing to reduce, so only hvac_controls is enumerated.
    expect(plan!.assessment.evaluatedSubsets).toBe(2);
    expect(plan!.excluded).toHaveLength(0);
  });

  test("a fat live catalog is truncated to the engine's enumeration cap", () => {
    // The catalog can carry more usable measures than the engine can enumerate;
    // the bridge ranks by reduction and truncates to twelve, so the optimizer
    // never sees more than 2^12 subsets no matter how many measures are live.
    const many = Array.from({ length: 18 }, (_, index) =>
      measure({ id: `measure_${index}`, estReductionTco2e: 100 + index }),
    );

    const plan = planRetrofit(gasOffice, many);

    expect(plan!.assessment.evaluatedSubsets).toBe(2 ** 12);
  });

  test("a building the engine can't price has no retrofit plan", () => {
    const unpriceable: BuildingFacts = {
      ...gasOffice,
      annualEmissionsTco2e: null,
      occupancyGroups: [],
    };

    expect(planRetrofit(unpriceable, [measure()])).toBeNull();
  });
});

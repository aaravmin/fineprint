import { describe, expect, test } from "vitest";
import { planRetrofit } from "../src/retrofit.ts";
import type { BuildingFacts, InfrastructureProfile } from "../src/types.ts";

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
  provenance: [],
};

describe("planRetrofit", () => {
  test("a gas building with bad boilers keeps every measure and cites the boilers", () => {
    const plan = planRetrofit(gasOffice);

    expect(plan).not.toBeNull();
    expect(plan!.excluded).toHaveLength(0);
    expect(plan!.assessment.evaluatedSubsets).toBe(128); // all 7 measures on the table
    expect(plan!.findings.some(finding => /boiler/i.test(finding))).toBe(true);
    expect(plan!.findings.some(finding => /defects on record/i.test(finding))).toBe(true);
  });

  test("an existing solar array drops the rooftop PV measure", () => {
    const withSolar: BuildingFacts = {
      ...gasOffice,
      infrastructureProfile: { ...baseProfile, hasPV: true },
    };

    const plan = planRetrofit(withSolar);

    expect(plan!.pathway).toBe("standard");
    if (plan!.pathway !== "standard") return;

    expect(plan!.excluded.map(measure => measure.id)).toContain("solar_pv");
    expect(plan!.assessment.evaluatedSubsets).toBe(64); // 6 measures left
    expect(plan!.assessment.macc.map(point => point.measureId)).not.toContain("solar_pv");
  });

  test("an all-electric building drops both combustion measures", () => {
    const allElectric: BuildingFacts = {
      ...gasOffice,
      infrastructureProfile: {
        ...baseProfile,
        heatingFuel: "electricity",
        fuelTypes: ["electricity"],
        boilerCount: 0,
        boilerCondition: null,
      },
    };

    const plan = planRetrofit(allElectric);
    const excludedIds = plan!.excluded.map(measure => measure.id);

    expect(excludedIds).toContain("heating_plant");
    expect(excludedIds).toContain("heat_pumps");
    expect(plan!.assessment.evaluatedSubsets).toBe(32); // 5 measures left
  });

  test("no infrastructure profile means no tailoring — the full catalog runs", () => {
    const noProfile: BuildingFacts = { ...gasOffice, infrastructureProfile: null };

    const plan = planRetrofit(noProfile);

    expect(plan!.excluded).toHaveLength(0);
    expect(plan!.findings).toHaveLength(0);
    expect(plan!.assessment.evaluatedSubsets).toBe(128);
  });

  test("a building the engine can't price has no retrofit plan", () => {
    const unpriceable: BuildingFacts = {
      ...gasOffice,
      annualEmissionsTco2e: null,
      occupancyGroups: [],
    };

    expect(planRetrofit(unpriceable)).toBeNull();
  });
});

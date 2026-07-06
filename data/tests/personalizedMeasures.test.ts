import { describe, expect, test } from "vitest";
import { RETROFIT_CATEGORIES } from "../../engine/src/index.ts";
import { assessBuildingSystems } from "../src/buildingSystems.ts";
import { buildCompliancePlan } from "../src/compliancePlan.ts";
import { ELECTRICITY_TCO2E_PER_KWH, KBTU_PER_KWH } from "../src/ll84.ts";
import { emptyPublicRecords } from "../src/lookup.ts";
import {
  PERSONALIZED_CATALOG,
  personalizeMeasures,
  type PersonalizedMeasure,
} from "../src/personalizedMeasures.ts";
import type {
  BisJobFiling,
  BisPermit,
  BuildingFacts,
  HpdViolation,
  Ll84FuelUse,
  PlutoCharacteristics,
  PublicRecords,
} from "../src/types.ts";

// A fixed clock: 2026, so a 1995 boiler reads 31 years old and a 2021 heat pump
// reads within the recent-replacement window.
const asOf = new Date("2026-07-05T00:00:00Z");

// The No. 2 oil coefficient (tCO2e per kBtu), copied from ll84.ts's fuel table
// so the test's emissions add up to what attribution will read. The electricity
// coefficient and kBtu bridge are the real exported constants.
const OIL_2_TCO2E_PER_KBTU = 0.00007421;

function oilFuel(kbtu: number): Ll84FuelUse {
  return { fuel: "fuel_oil_2", column: "fuel_oil_2_use_kbtu", kbtu, tco2e: kbtu * OIL_2_TCO2E_PER_KBTU };
}

function electricityFuel(kwh: number): Ll84FuelUse {
  return {
    fuel: "electricity",
    column: "electricity_use_grid_purchase_1",
    kbtu: kwh * KBTU_PER_KWH,
    tco2e: kwh * ELECTRICITY_TCO2E_PER_KWH,
  };
}

function pluto(overrides: Partial<PlutoCharacteristics> = {}): PlutoCharacteristics {
  return {
    bbl: "2024600001",
    numFloors: 12,
    buildingClass: "D7",
    bldgAreaSqft: 200_000,
    unitsResidential: 200,
    unitsTotal: 205,
    yearBuilt: 1970,
    landUse: "03",
    ownerName: "TEST OWNER",
    communityDistrict: 204,
    raw: {},
    ...overrides,
  };
}

function bisBoilerPermit(year: number): BisPermit {
  return {
    jobNumber: "100000001",
    permitSiNo: "P100000001",
    bin: "2002802",
    jobType: "A2",
    workType: "BL",
    permitType: "EW",
    permitSubtype: null,
    permitStatus: "ISSUED",
    filingDate: `01/10/${year}`,
    issuanceDate: `01/17/${year}`,
    expirationDate: null,
    raw: {},
  };
}

function heatPumpJob(year: number): BisJobFiling {
  return {
    jobNumber: "200000001",
    bin: "2002802",
    bbl: "2024600001",
    jobType: "A2",
    jobStatus: "PERMIT ISSUED",
    description: "INSTALLATION OF AIR-SOURCE HEAT PUMPS AND ELECTRIC HEATING; REMOVE OIL BOILER",
    preFilingDate: `03/03/${year}`,
    approvedDate: `05/05/${year}`,
    latestActionDate: `05/05/${year}`,
    raw: {},
  };
}

function lightingJob(year: number): BisJobFiling {
  return {
    jobNumber: "300000001",
    bin: "2002802",
    bbl: "2024600001",
    jobType: "A3",
    jobStatus: "SIGNED OFF",
    description: "LED LIGHTING RETROFIT THROUGHOUT COMMON AREAS",
    preFilingDate: `02/02/${year}`,
    approvedDate: `04/04/${year}`,
    latestActionDate: `04/04/${year}`,
    raw: {},
  };
}

function heatViolations(count: number): HpdViolation[] {
  return Array.from({ length: count }, (_, index) => ({
    violationId: `V${index}`,
    bin: "2002802",
    violationClass: "C",
    novType: "Original",
    description: "SECTION 27-2029 ADM CODE FAILURE TO MAINTAIN ADEQUATE HEAT",
    novIssuedDate: "2025-12-15T00:00:00.000",
    currentStatus: "VIOLATION OPEN",
    currentStatusDate: "2025-12-16T00:00:00.000",
    inspectionDate: "2025-12-15T00:00:00.000",
    apartment: `${index}A`,
    rentImpairing: true,
    raw: {},
  }));
}

function multifamily(overrides: Partial<BuildingFacts> = {}): BuildingFacts {
  return {
    bbl: "2024600001",
    bin: "2002802",
    address: "1000 Test Concourse, Bronx, NY",
    grossFloorAreaSqft: 200_000,
    occupancyGroups: [{ group: "Multifamily Housing", sqft: 200_000 }],
    annualEmissionsTco2e: 800,
    ll84FuelUse: [],
    isLl97Covered: true,
    isArticle321: false,
    plutoCharacteristics: pluto(),
    infrastructureProfile: null,
    openViolations: [],
    publicRecords: emptyPublicRecords(),
    provenance: [],
    ...overrides,
  };
}

function personalize(facts: BuildingFacts): PersonalizedMeasure[] {
  return personalizeMeasures(facts, assessBuildingSystems(facts, asOf), asOf);
}

function measureById(measures: PersonalizedMeasure[], id: string): PersonalizedMeasure {
  const found = measures.find(measure => measure.id === id);
  if (!found) {
    throw new Error(`no personalized measure with id ${id}`);
  }
  return found;
}

describe("PERSONALIZED_CATALOG", () => {
  test("every measure id is unique", () => {
    const ids = PERSONALIZED_CATALOG.map(entry => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every entry declares a category from the shared taxonomy", () => {
    const known = new Set(RETROFIT_CATEGORIES.map(category => category.id));
    for (const entry of PERSONALIZED_CATALOG) {
      expect(known.has(entry.category)).toBe(true);
    }
  });

  test("mutually exclusive alternatives share an exclusive group", () => {
    const heatingPrimary = PERSONALIZED_CATALOG.filter(
      entry => entry.exclusiveGroup === "heating_primary",
    ).map(entry => entry.id);
    expect(heatingPrimary).toEqual(
      expect.arrayContaining([
        "heat_pump_conversion",
        "ground_source_heat_pump",
        "gas_furnace_95_afue",
        "steam_boiler_replacement",
      ]),
    );

    const dhw = PERSONALIZED_CATALOG.filter(entry => entry.exclusiveGroup === "dhw").map(
      entry => entry.id,
    );
    expect(dhw).toEqual(
      expect.arrayContaining(["heat_pump_water_heater", "gas_tankless_water_heater"]),
    );
  });

  test("led lighting is the one measure that also retires LL88", () => {
    const led = PERSONALIZED_CATALOG.find(entry => entry.id === "led_lighting");
    expect(led?.satisfiesLaws).toEqual(["ll88"]);
  });
});

describe("personalizeMeasures - fuel switch is condition and fuel aware", () => {
  const oilBoilerFacts = multifamily({
    annualEmissionsTco2e: round1(40_000_000 * OIL_2_TCO2E_PER_KBTU + 3_500_000 * ELECTRICITY_TCO2E_PER_KWH),
    ll84FuelUse: [oilFuel(40_000_000), electricityFuel(3_500_000)],
    publicRecords: records({ bisPermits: [bisBoilerPermit(1995)], hpdViolations: heatViolations(30) }),
  });

  test("a failing oil boiler makes the heat pump a recommended, material cut", () => {
    const measures = personalize(oilBoilerFacts);
    const heatPump = measureById(measures, "heat_pump_conversion");

    expect(heatPump.applicability).toBe("recommended");
    expect(heatPump.estReductionTco2e).not.toBeNull();
    expect(heatPump.estReductionTco2e!).toBeGreaterThan(1_000);
    // The reduction is the fossil heating tCO2e net of the heat pump's electricity,
    // so it never exceeds the attributed heating emissions.
    const heating = assessBuildingSystems(oilBoilerFacts, asOf).systems.find(
      system => system.system === "heating_plant",
    );
    expect(heatPump.estReductionTco2e!).toBeLessThanOrEqual(heating!.estAnnualTco2e!);
    expect(heatPump.why).toMatch(/heat pump/i);
    expect(heatPump.evidence.length).toBeGreaterThan(0);
  });

  test("effectiveReductionFraction divides by the building's own emissions, not the priced total", () => {
    const measures = personalize(oilBoilerFacts);
    const heatPump = measureById(measures, "heat_pump_conversion");

    const expected = heatPump.estReductionTco2e! / oilBoilerFacts.annualEmissionsTco2e!;
    expect(heatPump.effectiveReductionFraction!).toBeCloseTo(expected, 2);
  });

  test("the same measure on an already-electric building is already done", () => {
    const electricFacts = multifamily({
      annualEmissionsTco2e: round1(8_650_000 * ELECTRICITY_TCO2E_PER_KWH),
      ll84FuelUse: [electricityFuel(8_650_000)],
      plutoCharacteristics: pluto({ yearBuilt: 2015 }),
      publicRecords: records({ bisJobs: [heatPumpJob(2021)] }),
    });

    const heatPump = measureById(personalize(electricFacts), "heat_pump_conversion");

    expect(heatPump.applicability).toBe("already_done");
    expect(heatPump.estReductionTco2e).toBeNull();
    expect(heatPump.why).toMatch(/already heats with electricity/i);
  });

  test("a boiler replaced within the window is already done, not a fuel switch", () => {
    const recentBoiler = multifamily({
      annualEmissionsTco2e: round1(40_000_000 * OIL_2_TCO2E_PER_KBTU),
      ll84FuelUse: [oilFuel(40_000_000)],
      publicRecords: records({ bisPermits: [bisBoilerPermit(2022)] }),
    });

    const heatPump = measureById(personalize(recentBoiler), "heat_pump_conversion");

    expect(heatPump.applicability).toBe("already_done");
    expect(heatPump.applicabilityReason).toMatch(/replaced within the last/i);
  });
});

describe("personalizeMeasures - attribution, gating, and cost bases", () => {
  const oilBoilerFacts = multifamily({
    annualEmissionsTco2e: round1(40_000_000 * OIL_2_TCO2E_PER_KBTU + 3_500_000 * ELECTRICITY_TCO2E_PER_KWH),
    ll84FuelUse: [oilFuel(40_000_000), electricityFuel(3_500_000)],
    publicRecords: records({ bisPermits: [bisBoilerPermit(1995)], hpdViolations: heatViolations(30) }),
  });

  test("steam measures are not applicable without steam evidence", () => {
    const steamDistribution = measureById(personalize(oilBoilerFacts), "steam_distribution_improvements");

    expect(steamDistribution.applicability).toBe("not_applicable");
    expect(steamDistribution.applicabilityReason).toMatch(/steam/i);
  });

  test("the heat pump is priced per residential unit from the master cost", () => {
    const heatPump = measureById(personalize(oilBoilerFacts), "heat_pump_conversion");

    // $16,500 per unit x 200 units.
    expect(heatPump.capexUsd).toBe(3_300_000);
    expect(heatPump.capexBasis).toMatch(/200 residential units/);
    expect(heatPump.capexBasis).toMatch(/air_source_heat_pump/);
  });

  test("a per-sqft measure prices off gross floor area", () => {
    const airSealing = measureById(personalize(oilBoilerFacts), "air_sealing");

    // $0.645/sqft x 200,000 sqft.
    expect(airSealing.capexUsd).toBe(129_000);
    expect(airSealing.capexBasis).toMatch(/master:air_sealing/);
  });

  test("when the record omits the heating fuel, the fuel switch degrades to a whole-building fraction", () => {
    // An electricity-only LL84 filing for an old multifamily with a live oil
    // registration: the systems dossier confirms oil from CATS but can't price
    // it, so heating attribution is null and the measure must fall back honestly.
    const anomalous = multifamily({
      annualEmissionsTco2e: 486,
      ll84FuelUse: [electricityFuel(486 / ELECTRICITY_TCO2E_PER_KWH)],
      plutoCharacteristics: pluto({ yearBuilt: 1923 }),
      publicRecords: records({
        catsPermits: [
          {
            applicationId: "CA271394",
            requestId: null,
            requestType: "CERTIFICATE TO OPERATE",
            bin: "2002802",
            primaryFuel: "NO4FUEL",
            secondaryFuel: null,
            make: "ROCKMILLS",
            model: null,
            burnerMake: null,
            burnerModel: null,
            issueDate: "2019-04-01T00:00:00.000",
            expirationDate: "2022-04-01T00:00:00.000",
            status: "EXPIRED",
            raw: {},
          },
        ],
        hpdViolations: heatViolations(30),
      }),
    });

    const systems = assessBuildingSystems(anomalous, asOf);
    const heating = systems.systems.find(system => system.system === "heating_plant");
    expect(heating!.estAnnualTco2e).toBeNull(); // the anomaly: fuel confirmed, emissions unpriceable

    const heatPump = measureById(personalizeMeasures(anomalous, systems, asOf), "heat_pump_conversion");
    expect(heatPump.applicability).toBe("recommended");
    // Falls back to 70% of the whole-building priced emissions (486 tCO2e).
    expect(heatPump.estReductionTco2e).toBeCloseTo(340.2, 1);
    expect(heatPump.why).toMatch(/no priced fuel/i);
  });

  test("existing rooftop solar makes solar already done", () => {
    const withSolar = multifamily({
      annualEmissionsTco2e: 800,
      ll84FuelUse: [electricityFuel(2_768_000)],
      infrastructureProfile: {
        hasLl84Filing: true,
        ll84ReportingYear: 2024,
        hasRecomputedEmissions: true,
        fuelTypes: ["electricity"],
        boilerRecords: [],
        buildJobFilings: [],
        electricalPermits: [
          {
            filingNumber: "E1",
            bin: "2002802",
            jobDescription: "INSTALL 40KW ROOFTOP SOLAR PV ARRAY",
            filingStatus: "ISSUED",
            filingDate: "2019-06-01",
            permitIssuedDate: "2019-07-01",
            isSolar: true,
            isStorage: false,
            raw: {},
          },
        ],
        heatingFuel: "electricity",
        hasPV: true,
        boilerCount: 0,
        boilerCondition: null,
        recentHvacWork: false,
        efficiencyTier: "medium",
        energyStarScore: 70,
      },
    });

    const solar = measureById(personalize(withSolar), "solar_pv");
    expect(solar.applicability).toBe("already_done");
    expect(solar.applicabilityReason).toMatch(/already on record/i);
  });
});

// The lighting recency rule: a lighting filing only reads as recently replaced
// when it is actually recent. Without the asOf check, a 2005 retrofit would mark
// the LED measure already done forever.
describe("personalizeMeasures - lighting retrofit recency", () => {
  function withLightingJob(year: number): BuildingFacts {
    return multifamily({
      annualEmissionsTco2e: round1(
        40_000_000 * OIL_2_TCO2E_PER_KBTU + 1_000_000 * ELECTRICITY_TCO2E_PER_KWH,
      ),
      ll84FuelUse: [oilFuel(40_000_000), electricityFuel(1_000_000)],
      publicRecords: records({ bisJobs: [lightingJob(year)] }),
    });
  }

  test("a 2005 lighting retrofit keeps the LED measure live at the serviceable fraction", () => {
    const dossierLighting = assessBuildingSystems(withLightingJob(2005), asOf).systems.find(
      entry => entry.system === "lighting",
    );
    expect(dossierLighting?.condition).toBe("serviceable");
    expect(dossierLighting?.presence).toBe("confirmed");

    const led = measureById(personalize(withLightingJob(2005)), "led_lighting");
    expect(led.applicability).toBe("applicable");
    expect(led.estReductionTco2e).not.toBeNull();
    expect(led.estReductionTco2e!).toBeGreaterThan(0);
  });

  test("a recent lighting retrofit marks the LED measure already done", () => {
    const led = measureById(personalize(withLightingJob(2024)), "led_lighting");

    expect(led.applicability).toBe("already_done");
    expect(led.applicabilityReason).toMatch(/recent upgrade on record/i);
  });
});

// The brief's acceptance test: two buildings identical but for their heating
// history. "Invest in heat pumps" must model very differently for each.
describe("acceptance: a 1995 oil boiler versus a 2021 heat-pump conversion", () => {
  const oilBoiler1995 = multifamily({
    address: "1995 Oil Boiler Building, Bronx, NY",
    bbl: "2024600001",
    annualEmissionsTco2e: round1(40_000_000 * OIL_2_TCO2E_PER_KBTU + 12_000_000 * ELECTRICITY_TCO2E_PER_KWH / KBTU_PER_KWH),
    ll84FuelUse: [oilFuel(40_000_000), electricityFuel(12_000_000 / KBTU_PER_KWH)],
    plutoCharacteristics: pluto({ yearBuilt: 1970 }),
    publicRecords: records({ bisPermits: [bisBoilerPermit(1995)], hpdViolations: heatViolations(30) }),
  });

  const heatPump2021 = multifamily({
    address: "2021 Heat Pump Building, Bronx, NY",
    bbl: "2024600002",
    annualEmissionsTco2e: round1(8_650_000 * ELECTRICITY_TCO2E_PER_KWH),
    ll84FuelUse: [electricityFuel(8_650_000)],
    plutoCharacteristics: pluto({ bbl: "2024600002", yearBuilt: 2015 }),
    publicRecords: records({ bisJobs: [heatPumpJob(2021)] }),
  });

  test("the heat-pump measure is recommended with a material cut for the oil boiler, already done for the heat pump", () => {
    const oilHeatPump = measureById(personalize(oilBoiler1995), "heat_pump_conversion");
    const electricHeatPump = measureById(personalize(heatPump2021), "heat_pump_conversion");

    expect(oilHeatPump.applicability).toBe("recommended");
    expect(oilHeatPump.estReductionTco2e!).toBeGreaterThan(1_000);

    expect(electricHeatPump.applicability).toBe("already_done");
    expect(electricHeatPump.estReductionTco2e).toBeNull();
  });

  test("the two plans allocate capex differently: the oil boiler funds the heat pump, the electric building does not", () => {
    const oilPlan = buildCompliancePlan(oilBoiler1995, { asOf });
    const electricPlan = buildCompliancePlan(heatPump2021, { asOf });

    const oilMeasureIds = oilPlan.measures.map(measure => measure.id);
    const electricMeasureIds = electricPlan.measures.map(measure => measure.id);

    expect(oilMeasureIds).toContain("heat_pump_conversion");
    expect(electricMeasureIds).not.toContain("heat_pump_conversion");
    expect(oilPlan.totalCapexUsd).not.toBe(electricPlan.totalCapexUsd);
  });

  test("the persisted plan carries the systems dossier and the full measure catalog", () => {
    const plan = buildCompliancePlan(oilBoiler1995, { asOf });

    expect(plan.personalization.systems.systems.length).toBe(8);
    expect(plan.personalization.measures.length).toBe(PERSONALIZED_CATALOG.length);
    const heatPumpAction = plan.actions.find(action => action.id === "heat_pump_conversion");
    expect(heatPumpAction?.targetSystem).toBe("heating_plant");
    expect(heatPumpAction?.why).toBeTruthy();
  });
});

function records(overrides: Partial<PublicRecords> = {}): PublicRecords {
  return { ...emptyPublicRecords(), ...overrides };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

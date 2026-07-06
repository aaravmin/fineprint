import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { assessBuildingSystems } from "../src/buildingSystems.ts";
import { emptyPublicRecords } from "../src/lookup.ts";
import { parseBisJobRows } from "../src/bisJobs.ts";
import { parseBisPermitRows } from "../src/bisPermits.ts";
import { parseCatsRows } from "../src/cats.ts";
import { parseDobViolationRows } from "../src/dobViolations.ts";
import { parseElevatorRows } from "../src/elevators.ts";
import { parseHpdComplaintRows } from "../src/hpdComplaints.ts";
import { parseHpdViolationRows } from "../src/hpdViolations.ts";
import type {
  BisJobFiling,
  BisPermit,
  BuildingFacts,
  CatsPermit,
  ElevatorDevice,
  HpdComplaintProblem,
  HpdViolation,
  Ll84FuelUse,
  PlutoCharacteristics,
  PublicRecords,
  SystemAssessment,
  SystemKey,
} from "../src/types.ts";

// A fixed clock so every recency and window judgment is deterministic.
const asOf = new Date("2026-07-05T00:00:00Z");

function facts(overrides: Partial<BuildingFacts> = {}): BuildingFacts {
  return {
    bbl: "2024600001",
    bin: "2002802",
    address: "Test Building, NY",
    grossFloorAreaSqft: 200_000,
    occupancyGroups: [{ group: "Multifamily Housing", sqft: 200_000 }],
    annualEmissionsTco2e: 800,
    ll84FuelUse: [],
    isLl97Covered: true,
    isArticle321: false,
    plutoCharacteristics: null,
    openViolations: [],
    publicRecords: emptyPublicRecords(),
    provenance: [],
    ...overrides,
  };
}

function records(overrides: Partial<PublicRecords> = {}): PublicRecords {
  return { ...emptyPublicRecords(), ...overrides };
}

function pluto(overrides: Partial<PlutoCharacteristics> = {}): PlutoCharacteristics {
  return {
    bbl: "2024600001",
    numFloors: 15,
    buildingClass: "D7",
    bldgAreaSqft: 200_000,
    unitsResidential: 298,
    unitsTotal: 300,
    yearBuilt: 1923,
    landUse: "03",
    ownerName: "TEST OWNER",
    communityDistrict: 204,
    raw: {},
    ...overrides,
  };
}

function fuel(label: string, column: string, kbtu: number, tco2e: number | null): Ll84FuelUse {
  return { fuel: label, column, kbtu, tco2e };
}

function catsPermit(overrides: Partial<CatsPermit> = {}): CatsPermit {
  return {
    applicationId: "CA000000",
    requestId: null,
    requestType: "CERTIFICATE TO OPERATE",
    bin: "2002802",
    primaryFuel: null,
    secondaryFuel: null,
    make: null,
    model: null,
    burnerMake: null,
    burnerModel: null,
    issueDate: null,
    expirationDate: null,
    status: null,
    raw: {},
    ...overrides,
  };
}

function bisPermit(overrides: Partial<BisPermit> = {}): BisPermit {
  return {
    jobNumber: "100000000",
    permitSiNo: null,
    bin: "2002802",
    jobType: null,
    workType: null,
    permitType: null,
    permitSubtype: null,
    permitStatus: null,
    filingDate: null,
    issuanceDate: null,
    expirationDate: null,
    raw: {},
    ...overrides,
  };
}

function bisJob(overrides: Partial<BisJobFiling> = {}): BisJobFiling {
  return {
    jobNumber: "200000000",
    bin: "2002802",
    bbl: "2024600001",
    jobType: null,
    jobStatus: null,
    description: null,
    preFilingDate: null,
    approvedDate: null,
    latestActionDate: null,
    raw: {},
    ...overrides,
  };
}

function hpdViolation(overrides: Partial<HpdViolation> = {}): HpdViolation {
  return {
    violationId: "1",
    bin: "2002802",
    violationClass: "C",
    novType: "Original",
    description: "§ 27-2029 ADM CODE PROVIDE AN ADEQUATE SUPPLY OF HEAT",
    novIssuedDate: "2026-02-01T00:00:00.000",
    currentStatus: "NOV SENT OUT",
    currentStatusDate: null,
    inspectionDate: null,
    apartment: null,
    rentImpairing: null,
    raw: {},
    ...overrides,
  };
}

function hpdComplaint(overrides: Partial<HpdComplaintProblem> = {}): HpdComplaintProblem {
  return {
    complaintId: "1",
    problemId: "1",
    bbl: "2024600001",
    bin: "2002802",
    majorCategory: "HEAT/HOT WATER",
    minorCategory: "ENTIRE BUILDING",
    problemCode: "NO HEAT",
    complaintStatus: "OPEN",
    problemStatus: "OPEN",
    statusDescription: null,
    receivedDate: "2026-02-01T00:00:00.000",
    raw: {},
    ...overrides,
  };
}

function elevator(overrides: Partial<ElevatorDevice> = {}): ElevatorDevice {
  return {
    deviceNumber: "1P1",
    bin: "2002802",
    deviceType: "Elevator",
    deviceStatus: "Active",
    statusDate: "1990-01-01T00:00:00.000",
    lastPeriodicInspection: null,
    cat1ReportYear: "2026",
    raw: {},
    ...overrides,
  };
}

function heatViolations(count: number): HpdViolation[] {
  return Array.from({ length: count }, (_unused, index) =>
    hpdViolation({ violationId: `V${index}` }),
  );
}

function heatComplaints(count: number): HpdComplaintProblem[] {
  return Array.from({ length: count }, (_unused, index) =>
    hpdComplaint({ complaintId: `C${index}` }),
  );
}

function system(dossier: { systems: SystemAssessment[] }, key: SystemKey): SystemAssessment {
  const found = dossier.systems.find(entry => entry.system === key);
  if (!found) {
    throw new Error(`no ${key} assessment in the dossier`);
  }
  return found;
}

// One entry each for oil and grid electricity, so the fuel precedence and the
// attribution both have something to work with.
const oilFuelUse: Ll84FuelUse[] = [
  fuel("fuel_oil_2", "fuel_oil_2_use_kbtu", 8_000_000, 593.7),
  fuel("electricity", "electricity_use_grid_purchase_1", 700_000, 202.3),
];
const electricOnlyFuelUse: Ll84FuelUse[] = [
  fuel("electricity", "electricity_use_grid_purchase_1", 1_700_000, 486),
];

describe("heating fuel precedence", () => {
  test("trusts a fossil fuel the LL84 filing reports", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: [
          fuel("natural_gas", "natural_gas_use_kbtu", 6_000_000, 318.7),
          fuel("electricity", "electricity_use_grid_purchase_1", 500_000, 144.5),
        ],
        plutoCharacteristics: pluto(),
      }),
      asOf,
    );
    const heating = system(dossier, "heating_plant");

    expect(heating.fuel).toBe("natural gas");
    expect(heating.confidence).toBe("high");
    expect(heating.evidence.some(ref => ref.datasetId === "5zyy-y8am")).toBe(true);
  });

  test("reconciles an electricity-only filing against a live CATS oil boiler", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: electricOnlyFuelUse,
        plutoCharacteristics: pluto(),
        publicRecords: records({
          catsPermits: [
            catsPermit({
              applicationId: "CA271394",
              primaryFuel: "NO4FUEL",
              issueDate: "2019-08-22T00:00:00.000",
              expirationDate: "2022-03-30T00:00:00.000",
              status: "EXPIRED",
            }),
          ],
        }),
      }),
      asOf,
    );
    const heating = system(dossier, "heating_plant");

    expect(heating.fuel).toBe("No. 4 fuel oil");
    expect(heating.confidence).toBe("low");
    // Both sources are cited: the suspect LL84 filing and the CATS registration.
    expect(heating.evidence.some(ref => ref.datasetId === "5zyy-y8am")).toBe(true);
    expect(heating.evidence.some(ref => ref.recordId === "CA271394")).toBe(true);
    expect(
      heating.conditionSignals.some(signal => /electricity only/i.test(signal) && /CATS/.test(signal)),
    ).toBe(true);
  });

  test("a recent heat-pump filing suppresses the anomaly and keeps the building electric", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: electricOnlyFuelUse,
        plutoCharacteristics: pluto(),
        publicRecords: records({
          catsPermits: [
            catsPermit({ primaryFuel: "NO4FUEL", expirationDate: "2019-03-30T00:00:00.000" }),
          ],
          bisJobs: [
            bisJob({
              description: "INSTALL AIR-SOURCE HEAT PUMP SYSTEM, REMOVE OIL BOILER",
              preFilingDate: "03/15/2022",
            }),
          ],
        }),
      }),
      asOf,
    );
    const heating = system(dossier, "heating_plant");

    expect(heating.fuel).toBe("electricity");
  });

  test("assumes fuel oil or gas for a pre-1990 building with nothing on record", () => {
    const dossier = assessBuildingSystems(
      facts({ ll84FuelUse: [], plutoCharacteristics: pluto({ yearBuilt: 1955 }) }),
      asOf,
    );
    const heating = system(dossier, "heating_plant");

    expect(heating.fuel).toBe("fuel oil or gas (unconfirmed)");
    expect(heating.presence).toBe("assumed");
    expect(heating.confidence).toBe("low");
  });
});

describe("heating vintage", () => {
  test("dates the plant from the latest BIS boiler permit", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: oilFuelUse,
        plutoCharacteristics: pluto(),
        publicRecords: records({
          bisPermits: [
            bisPermit({ workType: "BL", permitSiNo: "641585", issuanceDate: "01/17/1995" }),
          ],
        }),
      }),
      asOf,
    );
    const heating = system(dossier, "heating_plant");

    expect(heating.vintageYear).toBe(1995);
    expect(heating.vintageBasis).toMatch(/boiler permit/);
    expect(heating.evidence.some(ref => ref.recordId === "641585")).toBe(true);
  });

  test("ignores CATS certificate dates as an install vintage", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: oilFuelUse,
        plutoCharacteristics: pluto(),
        publicRecords: records({
          bisPermits: [bisPermit({ workType: "BL", issuanceDate: "01/17/1995" })],
          // A 2019 recert must not read as a 2019 boiler.
          catsPermits: [catsPermit({ primaryFuel: "NO4FUEL", issueDate: "2019-08-22T00:00:00.000" })],
        }),
      }),
      asOf,
    );

    expect(system(dossier, "heating_plant").vintageYear).toBe(1995);
  });

  test("falls back to the year built when no install record exists", () => {
    const dossier = assessBuildingSystems(
      facts({ ll84FuelUse: oilFuelUse, plutoCharacteristics: pluto({ yearBuilt: 1923 }) }),
      asOf,
    );
    const heating = system(dossier, "heating_plant");

    expect(heating.vintageYear).toBeNull();
    expect(heating.vintageBasis).toBe("assumed original to the 1923 building");
  });
});

describe("heating condition", () => {
  test("flags failing on a density of heat violations and complaints", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: oilFuelUse,
        plutoCharacteristics: pluto({ unitsResidential: 100 }),
        publicRecords: records({
          hpdViolations: heatViolations(20),
          hpdComplaints: heatComplaints(30),
        }),
      }),
      asOf,
    );
    const heating = system(dossier, "heating_plant");

    expect(heating.condition).toBe("failing");
    expect(heating.conditionSignals.some(signal => /20 HPD heat/.test(signal))).toBe(true);
  });

  test("a recent replacement outranks live heat complaints", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: oilFuelUse,
        plutoCharacteristics: pluto({ unitsResidential: 100 }),
        publicRecords: records({
          bisPermits: [bisPermit({ workType: "BL", issuanceDate: "05/01/2021" })],
          hpdViolations: heatViolations(20),
          hpdComplaints: heatComplaints(30),
        }),
      }),
      asOf,
    );
    const heating = system(dossier, "heating_plant");

    expect(heating.condition).toBe("recently_replaced");
    // The complaints are not erased; the tension stays visible in the signals.
    expect(heating.conditionSignals.some(signal => /20 HPD heat/.test(signal))).toBe(true);
  });

  test("aging when the plant is old with no failing signal", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: oilFuelUse,
        plutoCharacteristics: pluto(),
        publicRecords: records({
          bisPermits: [bisPermit({ workType: "BL", issuanceDate: "01/17/1985" })],
        }),
      }),
      asOf,
    );

    expect(system(dossier, "heating_plant").condition).toBe("aging");
  });

  test("aging when there is no install date but the building is old", () => {
    const dossier = assessBuildingSystems(
      facts({ ll84FuelUse: oilFuelUse, plutoCharacteristics: pluto({ yearBuilt: 1960 }) }),
      asOf,
    );

    expect(system(dossier, "heating_plant").condition).toBe("aging");
  });
});

describe("emissions attribution", () => {
  test("splits heating and electricity into shares that sum to at most 1", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: oilFuelUse,
        plutoCharacteristics: pluto(),
        publicRecords: records({ elevatorDevices: [elevator()] }),
      }),
      asOf,
    );

    const heating = system(dossier, "heating_plant");
    expect(heating.shareOfEmissions).not.toBeNull();
    // Multifamily heating plant takes 70% of the fossil fuel, a clear majority.
    expect(heating.shareOfEmissions!).toBeGreaterThan(0.4);

    const total = dossier.systems.reduce(
      (sum, entry) => sum + (entry.shareOfEmissions ?? 0),
      0,
    );
    expect(total).toBeLessThanOrEqual(1.0001);
    expect(dossier.totalTco2e).toBeCloseTo(796, 0);
  });

  test("returns null attribution with an honest note when the LL84 fuel detail is missing", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: [],
        plutoCharacteristics: pluto(),
        publicRecords: records({ elevatorDevices: [elevator()] }),
      }),
      asOf,
    );

    expect(dossier.totalTco2e).toBeNull();
    expect(dossier.attributionNote).toMatch(/no LL84 fuel breakdown/i);
    for (const entry of dossier.systems) {
      expect(entry.estAnnualTco2e).toBeNull();
      expect(entry.shareOfEmissions).toBeNull();
    }
  });

  test("leaves heating unattributed when the CATS fuel is absent from the filing", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: electricOnlyFuelUse,
        plutoCharacteristics: pluto(),
        publicRecords: records({
          catsPermits: [catsPermit({ primaryFuel: "NO4FUEL", expirationDate: "2022-03-30T00:00:00.000" })],
        }),
      }),
      asOf,
    );

    const heating = system(dossier, "heating_plant");
    expect(heating.estAnnualTco2e).toBeNull();
    expect(dossier.attributionNote).toMatch(/understates/);
    // Electricity still splits into the electric end uses.
    expect(system(dossier, "cooling").estAnnualTco2e).not.toBeNull();
  });

  test("a filed but unpriceable heating fuel reads as uncoefficiented, not missing from the filing", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: [
          fuel("fuel_oil_5_6", "fuel_oil_5_6_use_kbtu", 30_000_000, null),
          fuel("electricity", "electricity_use_grid_purchase_1", 3_412_000, 289),
        ],
        plutoCharacteristics: pluto(),
      }),
      asOf,
    );

    // The filing itself reports the No. 5/6 oil; the statute just has no verified
    // coefficient for it. The dossier must say so rather than claim the filing
    // omits the building's heating fuel.
    const heating = system(dossier, "heating_plant");
    expect(heating.fuel).toBe("No. 5/6 fuel oil");
    expect(heating.estAnnualTco2e).toBeNull();
    expect(heating.attributionBasis).toMatch(/no verified emissions coefficient/i);
    expect(heating.attributionBasis).not.toMatch(/CATS/);
    expect(dossier.attributionNote).toMatch(/no verified emissions coefficient/i);
    expect(dossier.attributionNote).toMatch(/understates/);
  });
});

describe("the other systems", () => {
  test("elevators are confirmed and counted from the device registry", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: oilFuelUse,
        publicRecords: records({
          elevatorDevices: [
            elevator({ deviceNumber: "A" }),
            elevator({ deviceNumber: "B" }),
            elevator({ deviceNumber: "C", deviceStatus: "Dismantled" }),
          ],
        }),
      }),
      asOf,
    );
    const elevators = system(dossier, "elevators");

    expect(elevators.presence).toBe("confirmed");
    expect(elevators.headline).toMatch(/3 elevators/);
  });

  test("no solar on record reads as none, not a fabricated presence", () => {
    const dossier = assessBuildingSystems(facts({ ll84FuelUse: oilFuelUse }), asOf);
    const solar = system(dossier, "solar_pv");

    expect(solar.presence).toBe("none");
    expect(solar.evidence).toHaveLength(1);
  });

  test("cooling stays unknown without equipment evidence and is never fabricated as fossil", () => {
    const dossier = assessBuildingSystems(facts({ ll84FuelUse: oilFuelUse }), asOf);
    const cooling = system(dossier, "cooling");

    expect(cooling.presence).toBe("unknown");
    expect(cooling.fuel).toBeNull();
  });

  test("lighting is honestly unknown yet still carries its electricity share", () => {
    const dossier = assessBuildingSystems(facts({ ll84FuelUse: oilFuelUse }), asOf);
    const lighting = system(dossier, "lighting");

    expect(lighting.presence).toBe("unknown");
    expect(lighting.estAnnualTco2e).not.toBeNull();
  });
});

// The four scenarios the brief names, plus the before/after pair that is Aarav's
// example: identical buildings that differ only in heating history.
describe("brief scenarios", () => {
  test("(a) a pre-war oil multifamily with heavy heat complaints: failing plant, big share", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: oilFuelUse,
        plutoCharacteristics: pluto({ unitsResidential: 100 }),
        publicRecords: records({
          bisPermits: [bisPermit({ workType: "BL", issuanceDate: "01/17/1970" })],
          hpdViolations: heatViolations(25),
          hpdComplaints: heatComplaints(40),
        }),
      }),
      asOf,
    );
    const heating = system(dossier, "heating_plant");

    expect(heating.fuel).toBe("No. 2 fuel oil");
    expect(heating.condition).toBe("failing");
    expect(heating.shareOfEmissions!).toBeGreaterThan(0.4);
  });

  test("(b) the same building after a 2021 boiler replacement: recently replaced", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: oilFuelUse,
        plutoCharacteristics: pluto({ unitsResidential: 100 }),
        publicRecords: records({
          bisPermits: [bisPermit({ workType: "BL", issuanceDate: "06/01/2021" })],
          hpdViolations: heatViolations(2),
          hpdComplaints: heatComplaints(3),
        }),
      }),
      asOf,
    );

    expect(system(dossier, "heating_plant").condition).toBe("recently_replaced");
  });

  test("(c) an all-electric modern office fabricates no fossil systems", () => {
    const dossier = assessBuildingSystems(
      facts({
        ll84FuelUse: electricOnlyFuelUse,
        occupancyGroups: [{ group: "Office", sqft: 200_000 }],
        plutoCharacteristics: pluto({ yearBuilt: 2015, unitsResidential: 0, buildingClass: "O4" }),
      }),
      asOf,
    );
    const heating = system(dossier, "heating_plant");

    expect(heating.fuel).toBe("electricity");
    for (const entry of dossier.systems) {
      expect(entry.fuel === null || !/oil|gas/i.test(entry.fuel)).toBe(true);
    }
  });

  test("(d) a building with no LL84 filing yields null attribution with an honest note", () => {
    const dossier = assessBuildingSystems(
      facts({ ll84FuelUse: [], plutoCharacteristics: pluto() }),
      asOf,
    );

    expect(dossier.totalTco2e).toBeNull();
    expect(dossier.attributionNote).toMatch(/no LL84 fuel breakdown/i);
  });

  // Aarav's example encoded as a Phase 2 invariant: the two heating histories must
  // land on different conditions, which is what will drive different measures.
  test("the 1995-oil and 2021-replacement buildings reach different conditions", () => {
    const shared = {
      ll84FuelUse: oilFuelUse,
      plutoCharacteristics: pluto({ unitsResidential: 100 }),
    };
    const oldOilBoiler = assessBuildingSystems(
      facts({
        ...shared,
        publicRecords: records({
          bisPermits: [bisPermit({ workType: "BL", issuanceDate: "01/17/1995" })],
          hpdViolations: heatViolations(25),
          hpdComplaints: heatComplaints(40),
        }),
      }),
      asOf,
    );
    const replaced = assessBuildingSystems(
      facts({
        ...shared,
        publicRecords: records({
          bisPermits: [bisPermit({ workType: "BL", issuanceDate: "06/01/2021" })],
        }),
      }),
      asOf,
    );

    expect(system(oldOilBoiler, "heating_plant").condition).toBe("failing");
    expect(system(replaced, "heating_plant").condition).toBe("recently_replaced");
  });
});

// End-to-end on the real 900 Grand Concourse public record: the Phase 1 fixtures
// parsed with the Phase 1 parsers, run through the dossier. The building's 2024
// LL84 filing is anomalous - electricity-only, ENERGY STAR 100, 486 tCO2e - so it
// is reproduced inline here (no LL84 fixture was recorded) to exercise the
// CATS-over-LL84 reconciliation against the real permit, violation, and elevator
// history. CATS proves a No. 4 oil boiler in service through 2022.
describe("900 Grand Concourse, end to end", () => {
  function fixture(name: string): unknown {
    return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
  }

  const grandConcourse: BuildingFacts = facts({
    address: "900 GRAND CONCOURSE, Bronx, NY, USA",
    occupancyGroups: [{ group: "Multifamily Housing", sqft: 300_000 }],
    grossFloorAreaSqft: 300_000,
    ll84FuelUse: [fuel("electricity", "electricity_use_grid_purchase_1", 5_700_000, 486)],
    plutoCharacteristics: pluto({ yearBuilt: 1923, unitsResidential: 298, buildingClass: "D7" }),
    publicRecords: {
      bisPermits: parseBisPermitRows(fixture("bisPermits-2002802.json") as never[]),
      bisJobs: parseBisJobRows(fixture("bisJobs-2002802.json") as never[]),
      dobViolations: parseDobViolationRows(fixture("dobViolations-2024600001.json") as never[]),
      hpdViolations: parseHpdViolationRows(fixture("hpdViolations-2024600001.json") as never[]),
      hpdComplaints: parseHpdComplaintRows(fixture("hpdComplaints-2024600001.json") as never[]),
      catsPermits: parseCatsRows(fixture("cats-2002802.json") as never[]),
      elevatorDevices: parseElevatorRows(fixture("elevators-2002802.json") as never[]),
    },
  });

  const dossier = assessBuildingSystems(grandConcourse, asOf);

  test("heating fuel resolves to oil via the CATS-over-anomalous-LL84 rule", () => {
    const heating = system(dossier, "heating_plant");

    expect(heating.fuel).toBe("No. 4 fuel oil");
    expect(heating.confidence).toBe("low");
    // Both the suspect filing and the real registration are cited.
    expect(heating.evidence.some(ref => ref.datasetId === "5zyy-y8am")).toBe(true);
    expect(heating.evidence.some(ref => ref.recordId === "CA271394")).toBe(true);
    expect(heating.headline).toMatch(/No\. 4 fuel oil boiler, installed around 1995/);
  });

  test("condition is failing, citing the 25 class-C heat violations", () => {
    const heating = system(dossier, "heating_plant");

    expect(heating.condition).toBe("failing");
    expect(heating.conditionSignals.some(signal => /\b25\b/.test(signal) && /class C/.test(signal))).toBe(
      true,
    );
    // The evidence points at a real HPD violation id from the fixture.
    expect(heating.evidence.some(ref => ref.datasetId === "wvxf-dwi5" && ref.recordId !== null)).toBe(
      true,
    );
  });

  test("four elevators are present and serviceable", () => {
    const elevators = system(dossier, "elevators");

    expect(elevators.presence).toBe("confirmed");
    expect(elevators.headline).toMatch(/4 elevators/);
    expect(elevators.condition).toBe("serviceable");
    expect(elevators.evidence.some(ref => /^2P/.test(ref.recordId ?? ""))).toBe(true);
  });

  test("attribution runs on the electricity total and flags the missing heating fuel", () => {
    expect(dossier.totalTco2e).toBe(486);
    expect(system(dossier, "heating_plant").estAnnualTco2e).toBeNull();
    expect(dossier.attributionNote).toMatch(/understates/);
    expect(dossier.generatedFrom).toEqual(
      expect.arrayContaining(["f4rp-2kvy", "wvxf-dwi5", "e5aq-a4j2"]),
    );
  });
});

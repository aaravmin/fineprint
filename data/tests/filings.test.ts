import { describe, expect, test } from "vitest";
import {
  ll84FilingStatus,
  ll87FilingStatus,
  ll11FilingStatus,
  ll152FilingStatus,
} from "../src/filings.ts";
import type { BuildingFacts } from "../src/types.ts";

const asOf = new Date("2026-06-06T00:00:00Z");

function buildingWith(overrides: Partial<BuildingFacts>): BuildingFacts {
  return {
    bbl: "1008350041",
    bin: "1015862",
    address: "350 5 AVENUE, New York, NY, USA",
    grossFloorAreaSqft: 2_852_257,
    occupancyGroups: [{ group: "Office", sqft: 2_852_257 }],
    annualEmissionsTco2e: 16_678.22,
    isLl97Covered: true,
    isArticle321: false,
    plutoCharacteristics: null,
    openViolations: [],
    provenance: [],
    ...overrides,
  };
}

describe("LL84 filing status", () => {
  test("a current reporting year is satisfied and points at the next May 1", () => {
    const facts = buildingWith({
      infrastructureProfile: profileWith({ ll84ReportingYear: 2025 }),
    });

    const status = ll84FilingStatus(facts, asOf);

    expect(status.status).toBe("satisfied");
    expect(status.dueDate).toBe("2027-05-01"); // past 2026-05-01, so next is 2027
    expect(status.onRecord).toBe(true);
  });

  test("no filing on record is due", () => {
    const facts = buildingWith({
      infrastructureProfile: profileWith({
        hasLl84Filing: false,
        ll84ReportingYear: null,
      }),
    });

    expect(ll84FilingStatus(facts, asOf).status).toBe("due");
  });

  test("a stale reporting year is at risk", () => {
    const facts = buildingWith({
      infrastructureProfile: profileWith({ ll84ReportingYear: 2022 }),
    });

    expect(ll84FilingStatus(facts, asOf).status).toBe("at_risk");
  });
});

describe("LL87 filing status", () => {
  test("the 10-year deadline lands on the year ending in the tax-block last digit", () => {
    // BBL 1-00835-0041 -> tax block 00835, last digit 5 -> next year ending in 5 is 2035.
    const status = ll87FilingStatus(buildingWith({}), asOf);

    expect(status.dueDate).toBe("2035-12-31");
    expect(status.onRecord).toBeNull(); // no dataset confirms the filing
    expect(status.cycle).toMatch(/ends in 5/);
  });

  test("a deadline more than 18 months out reads unknown, not satisfied", () => {
    expect(ll87FilingStatus(buildingWith({}), asOf).status).toBe("unknown");
  });
});

describe("LL11 sub-cycle windows by tax-block last digit", () => {
  test("a block ending in 5 is sub-cycle A: window Feb 2025 to Feb 2027", () => {
    // BBL 1-00835-0041 -> tax block 00835, last digit 5 -> Cycle 10 sub-cycle A.
    const facts = buildingWith({
      plutoCharacteristics: plutoWith({ numFloors: 30 }),
    });

    const status = ll11FilingStatus(facts, asOf);

    expect(status.dueDate).toBe("2027-02-21");
    // asOf 2026-06-06 sits inside the window; no filing data -> unknown, not due.
    expect(status.status).toBe("unknown");
    expect(status.cycle).toMatch(/sub-cycle A/);
    expect(status.cycle).toMatch(/30 stories/);
  });

  test("a real filed report in the cycle reads satisfied", () => {
    const facts = buildingWith({
      plutoCharacteristics: plutoWith({ numFloors: 30 }),
      facadeFilings: [
        {
          tr6Number: "TR6-123",
          bin: "1015862",
          cycle: "10",
          filingType: "Initial",
          filingStatus: "Filed",
          currentStatus: "SAFE",
          raw: {},
        },
      ],
    });

    const status = ll11FilingStatus(facts, asOf);

    expect(status.onRecord).toBe(true);
    expect(status.status).toBe("satisfied");
    expect(status.action).toBeNull();
  });

  test("only an auto-generated placeholder reads due inside the window", () => {
    const facts = buildingWith({
      plutoCharacteristics: plutoWith({ numFloors: 30 }),
      facadeFilings: [
        {
          tr6Number: "TR6-902663-10A-N1",
          bin: "1015862",
          cycle: "10",
          filingType: "Auto-Generated",
          filingStatus: "No Report Filed",
          currentStatus: "SWARMP",
          raw: {},
        },
      ],
    });

    const status = ll11FilingStatus(facts, asOf);

    expect(status.onRecord).toBe(false);
    expect(status.status).toBe("due");
  });
});

describe("LL152 community-district cycle", () => {
  test("district 5 files in 2025; past that, the next cycle year is 2029", () => {
    // CD 105 -> Manhattan district 5 -> 2025 cycle; asOf mid-2026 -> next is 2029.
    const facts = buildingWith({
      plutoCharacteristics: plutoWith({ communityDistrict: 105 }),
    });

    const status = ll152FilingStatus(facts, asOf);

    expect(status.dueDate).toBe("2029-12-31");
    expect(status.cycle).toMatch(/community district 5/);
    expect(status.onRecord).toBeNull(); // no public dataset confirms filings
  });

  test("district 4 files in 2026 and reads due inside the actionable window", () => {
    const facts = buildingWith({
      plutoCharacteristics: plutoWith({ communityDistrict: 304 }),
    });

    const status = ll152FilingStatus(facts, asOf);

    expect(status.dueDate).toBe("2026-12-31");
    expect(status.status).toBe("due");
  });

  test("an unknown district stays undated", () => {
    const facts = buildingWith({
      plutoCharacteristics: plutoWith({ communityDistrict: null }),
    });

    expect(ll152FilingStatus(facts, asOf).dueDate).toBeNull();
  });
});

function profileWith(
  overrides: Partial<BuildingFacts["infrastructureProfile"] & object>,
) {
  return {
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
    ...overrides,
  };
}

function plutoWith(
  overrides: Partial<NonNullable<BuildingFacts["plutoCharacteristics"]>>,
) {
  return {
    bbl: "1008350041",
    numFloors: null,
    buildingClass: null,
    bldgAreaSqft: null,
    unitsResidential: null,
    unitsTotal: null,
    yearBuilt: null,
    landUse: null,
    ownerName: null,
    communityDistrict: null,
    raw: {},
    ...overrides,
  };
}

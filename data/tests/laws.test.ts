import { describe, expect, test } from "vitest";
import {
  applicableLaws,
  energyGradeForScore,
  lawById,
  LAW_REGISTRY_VERSION,
  LAWS,
  type BuildingProfile,
} from "../src/laws.ts";

function profile(overrides: Partial<BuildingProfile> = {}): BuildingProfile {
  return { sqft: 80_000, isAffordable: false, ...overrides };
}

describe("applicableLaws", () => {
  test("a market-rate office gets gas piping duty but not the allergen law", () => {
    const lawIds = applicableLaws(profile()).map(law => law.id);

    expect(lawIds).toContain("ll152");
    expect(lawIds).not.toContain("ll55");
  });

  test("an affordable residential building gets the allergen law too", () => {
    const lawIds = applicableLaws(profile({ isAffordable: true })).map(law => law.id);

    expect(lawIds).toContain("ll152");
    expect(lawIds).toContain("ll55");
  });

  test("PACE financing is an opportunity, never spawned as an obligation", () => {
    const lawIds = applicableLaws(profile()).map(law => law.id);

    expect(lawIds).not.toContain("ll96");
  });

  test("LL55 models no monetary penalty — HPD violation classes vary too widely", () => {
    const ll55 = lawById("ll55")!;

    expect(ll55.penaltyUsd(profile({ isAffordable: true }))).toBeNull();
  });
});

describe("applicability uses real building characteristics, not floor-area proxies", () => {
  test("LL11 turns on story count when PLUTO knows it, over the sqft proxy", () => {
    // A short but sprawling building: under six stories, so no FISP, even though
    // its floor area clears the old 60k proxy.
    const lowRise = applicableLaws(profile({ sqft: 90_000, numFloors: 4 })).map(
      l => l.id,
    );
    expect(lowRise).not.toContain("ll11");

    // A slim tower: over six stories on a small footprint still files FISP.
    const tower = applicableLaws(profile({ sqft: 20_000, numFloors: 12 })).map(l => l.id);
    expect(tower).toContain("ll11");
  });

  test("LL55 turns on residential unit count when PLUTO knows it", () => {
    const tiny = applicableLaws(profile({ isAffordable: true, unitsResidential: 2 })).map(
      l => l.id,
    );
    expect(tiny).not.toContain("ll55");

    const walkup = applicableLaws(profile({ unitsResidential: 9 })).map(l => l.id);
    expect(walkup).toContain("ll55");
  });

  test("LL97 covers a small building sharing a 50k+ tax lot, and exempts houses of worship", () => {
    const onSharedLot = applicableLaws(
      profile({ sqft: 15_000, lotAggregateSqft: 60_000 }),
    );
    expect(onSharedLot.map(l => l.id)).toContain("ll97");

    const church = applicableLaws(profile({ sqft: 90_000, buildingClass: "M1" }));
    expect(church.map(l => l.id)).not.toContain("ll97");
  });
});

describe("penalty estimates", () => {
  test("flat statutory penalties do not scale with building size", () => {
    const small = profile({ sqft: 30_000 });
    const large = profile({ sqft: 900_000 });

    expect(lawById("ll84")!.penaltyUsd(small)).toBe(2_000);
    expect(lawById("ll84")!.penaltyUsd(large)).toBe(2_000);
    expect(lawById("ll152")!.penaltyUsd(small)).toBe(10_000);
    expect(lawById("ll33")!.penaltyUsd(large)).toBe(1_250);
  });

  test("audit, facade, and lighting laws model no fabricated dollar penalty", () => {
    // These once returned per-sqft "penalties" reverse-engineered from round
    // numbers, not statute. Like LL55, they now model no monetary exposure.
    const large = profile({ sqft: 600_000 });

    expect(lawById("ll87")!.penaltyUsd(large)).toBeNull();
    expect(lawById("ll11")!.penaltyUsd(large)).toBeNull();
    expect(lawById("ll88")!.penaltyUsd(large)).toBeNull();
  });

  test("LL97 carries no stub penalty — the engine supplies the real fine", () => {
    // The old $0.0005/sqft x $268 stub fabricated exposure when emissions were
    // unknown; without emissions the registry now returns null.
    expect(lawById("ll97")!.penaltyUsd(profile({ sqft: 600_000 }))).toBeNull();
  });
});

describe("statutory deadlines are real cycle dates, not fixed offsets", () => {
  const asOf = new Date(Date.UTC(2026, 5, 8)); // 2026-06-08, past this year's May 1

  test("LL84 benchmarking is the next May 1", () => {
    const due = lawById("ll84")!.nextDeadline(asOf, profile());
    expect(due?.toISOString().slice(0, 10)).toBe("2027-05-01");
  });

  test("LL87 falls on the tax-block decade year", () => {
    // BBL block ends in 6 -> next Dec 31 of a year ending in 6 is 2026.
    const due = lawById("ll87")!.nextDeadline(asOf, profile({ bbl: "1000160026" }));
    expect(due?.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  test("LL152 follows the community-district rotation", () => {
    // CD 101 -> district 1, in the 2024 group; next cycle close is 2028-12-31.
    const due = lawById("ll152")!.nextDeadline(asOf, profile({ communityDistrict: 101 }));
    expect(due?.toISOString().slice(0, 10)).toBe("2028-12-31");
  });

  test("laws with no datable cycle return null", () => {
    expect(
      lawById("ll55")!.nextDeadline(asOf, profile({ isAffordable: true })),
    ).toBeNull();
    expect(lawById("ll96")!.nextDeadline(asOf, profile())).toBeNull();
    // LL87 can't be dated without a tax block.
    expect(lawById("ll87")!.nextDeadline(asOf, profile())).toBeNull();
  });
});

describe("registry versioning", () => {
  test("the registry carries a version and every law dates its rule", () => {
    expect(LAW_REGISTRY_VERSION).toBeGreaterThan(0);
    for (const law of LAWS) {
      expect(law.version).toBeGreaterThan(0);
      expect(law.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("LL33 energy grade from an ENERGY STAR score", () => {
  test("a filed score never grades below D — F is only for non-submitters", () => {
    // A low but real score is a D, not an F. The F grade is reserved for a
    // building that failed to submit benchmarking, a filing signal, not a score.
    expect(energyGradeForScore(12)).toBe("D");
    expect(energyGradeForScore(0)).toBe("D");
    expect(energyGradeForScore(54)).toBe("D");
  });

  test("the statutory bands map to the right letters", () => {
    expect(energyGradeForScore(90)).toBe("A");
    expect(energyGradeForScore(85)).toBe("A");
    expect(energyGradeForScore(70)).toBe("B");
    expect(energyGradeForScore(55)).toBe("C");
  });

  test("no score posts an N, not a letter grade", () => {
    expect(energyGradeForScore(null)).toBe("N");
    expect(energyGradeForScore(undefined)).toBe("N");
  });
});

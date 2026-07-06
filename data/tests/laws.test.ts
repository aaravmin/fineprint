import { describe, expect, test } from "vitest";
import {
  applicableLaws,
  lawById,
  LAW_REGISTRY_VERSION,
  LAWS,
  type BuildingProfile,
} from "../laws.ts";

function profile(overrides: Partial<BuildingProfile> = {}): BuildingProfile {
  return { sqft: 80_000, isAffordable: false, ...overrides };
}

describe("applicableLaws", () => {
  test("a market-rate covered building gets LL97, not the affordable pathway", () => {
    const lawIds = applicableLaws(profile()).map(law => law.id);

    expect(lawIds).toContain("ll97");
    expect(lawIds).not.toContain("art321");
  });

  test("an affordable covered building gets the Article 321 pathway, not standard LL97", () => {
    const lawIds = applicableLaws(profile({ isAffordable: true })).map(law => law.id);

    expect(lawIds).toContain("art321");
    expect(lawIds).not.toContain("ll97");
  });
});

describe("applicability uses real building characteristics, not floor-area proxies", () => {
  test("LL97 covers a small building sharing a 50k+ tax lot, and exempts houses of worship", () => {
    const onSharedLot = applicableLaws(profile({ sqft: 15_000, lotAggregateSqft: 60_000 }));
    expect(onSharedLot.map(l => l.id)).toContain("ll97");

    const church = applicableLaws(profile({ sqft: 90_000, buildingClass: "M1" }));
    expect(church.map(l => l.id)).not.toContain("ll97");
  });
});

describe("penalty estimates", () => {
  test("the LL97 per-ton estimate scales with floor area", () => {
    const ll97 = lawById("ll97")!;
    expect(ll97.penaltyUsd(profile({ sqft: 30_000 }))).toBeLessThan(
      ll97.penaltyUsd(profile({ sqft: 900_000 }))!,
    );
  });

  test("the Article 321 pathway models no per-ton penalty", () => {
    expect(lawById("art321")!.penaltyUsd(profile({ isAffordable: true }))).toBeNull();
  });
});

describe("statutory deadlines are real cycle dates, not fixed offsets", () => {
  const asOf = new Date(Date.UTC(2026, 5, 8)); // 2026-06-08, past this year's May 1

  test("LL97 reporting is the next May 1", () => {
    const due = lawById("ll97")!.nextDeadline(asOf, profile());
    expect(due?.toISOString().slice(0, 10)).toBe("2027-05-01");
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

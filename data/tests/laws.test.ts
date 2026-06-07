import { describe, expect, test } from "vitest";
import { applicableLaws } from "../../spacetimedb/src/laws.ts";

describe("applicableLaws", () => {
  test("a market-rate office gets gas piping duty but not the allergen law", () => {
    const lawIds = applicableLaws(80_000, false).map(law => law.id);

    expect(lawIds).toContain("ll152");
    expect(lawIds).not.toContain("ll55");
  });

  test("an affordable residential building gets the allergen law too", () => {
    const lawIds = applicableLaws(80_000, true).map(law => law.id);

    expect(lawIds).toContain("ll152");
    expect(lawIds).toContain("ll55");
  });

  test("LL55 models no monetary fine — HPD violation classes vary too widely", () => {
    const ll55 = applicableLaws(80_000, true).find(law => law.id === "ll55");

    expect(ll55!.fineEstimateUsd(80_000, true)).toBeNull();
  });
});

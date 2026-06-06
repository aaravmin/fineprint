import { describe, expect, test } from "vitest";
import {
  fetchArticle321Flag,
  getCblEntry,
  isLl97Covered,
} from "../src/coveredBuildings.ts";

// The lookups read data/cbl/cbl26.json.gz — a committed snapshot of DOB's
// Covered Buildings List for filing year 2026 (see data/scripts/refresh-cbl.py).
// Test BBLs are real entries pulled from the snapshot:
//   1008350041  Empire State Building — LL97 pathway 0, all four laws
//   1000087501  39 Whitehall St — pathway 3, Article 321
//   1000020023  1 Pike St — LL84 only, not LL97
describe("covered buildings list", () => {
  test("the Empire State Building is LL97-covered on the standard pathway", async () => {
    expect(await isLl97Covered("1008350041")).toBe(true);
    expect(await fetchArticle321Flag("1008350041")).toBe(false);
  });

  test("a pathway-3 building reports as Article 321", async () => {
    expect(await isLl97Covered("1000087501")).toBe(true);
    expect(await fetchArticle321Flag("1000087501")).toBe(true);
  });

  test("an LL84-only building is not LL97-covered", async () => {
    const entry = getCblEntry("1000020023");

    expect(await isLl97Covered("1000020023")).toBe(false);
    expect(entry?.ll84).toBe(true);
    expect(entry?.ll87).toBe(false);
  });

  test("a BBL absent from the list is not covered by any law", async () => {
    expect(getCblEntry("9999999999")).toBeNull();
    expect(await isLl97Covered("9999999999")).toBe(false);
    expect(await fetchArticle321Flag("9999999999")).toBe(false);
  });

  test("entries carry DOF floor area and the snapshot edition", () => {
    const esb = getCblEntry("1008350041");

    expect(esb?.dofGrossSqft).toBe(2_812_739);
    expect(esb?.source).toMatch(/Filing Year 2026/);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseHpdViolationRows } from "../src/hpdViolations.ts";

// Real HPD Housing Maintenance Code violations (Socrata wvxf-dwi5) for 900
// Grand Concourse (BIN 2002802), recorded 2026-07-05 from the 2025-2026 heating
// season. The slice is heat-rich: § 27-2029 "adequate supply of heat" class C
// citations are the clearest public signal of a failing heating plant.
const rows = JSON.parse(
  readFileSync(
    new URL("./fixtures/hpdViolations-2024600001.json", import.meta.url),
    "utf8",
  ),
);

describe("parseHpdViolationRows", () => {
  test("maps each violation onto the normalized shape", () => {
    const violations = parseHpdViolationRows(rows);

    expect(violations).toHaveLength(rows.length);
    expect(violations[0].bin).toBe("2002802");
    expect(violations[0].violationId).not.toBe("");
    expect(violations[0].novIssuedDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  test("carries the class, the heat signal, and a parsed rent-impairing flag", () => {
    const violations = parseHpdViolationRows(rows);

    expect(violations.some(violation => violation.violationClass === "C")).toBe(true);
    expect(violations.some(violation => /HEAT/i.test(violation.description ?? ""))).toBe(
      true,
    );
    // rentimpairing is a Y/N string in the source, parsed to a boolean here.
    expect(
      violations.every(violation => typeof violation.rentImpairing === "boolean"),
    ).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseDobViolationRows } from "../src/dobViolations.ts";

// Real DOB violations (Socrata 3h2n-5cm9) for 900 Grand Concourse (BIN
// 2002802), recorded 2026-07-05. The slice carries low-pressure boiler
// (LBLVIO) and elevator (E) citations - the failing-equipment signal.
const rows = JSON.parse(
  readFileSync(
    new URL("./fixtures/dobViolations-2024600001.json", import.meta.url),
    "utf8",
  ),
);

describe("parseDobViolationRows", () => {
  test("maps each violation onto the normalized shape", () => {
    const violations = parseDobViolationRows(rows);

    expect(violations).toHaveLength(rows.length);
    expect(violations[0].bin).toBe("2002802");
    expect(violations[0].violationNumber).not.toBe("");
    // issue_date arrives as a bare YYYYMMDD string, kept as filed.
    expect(violations[0].issueDate).toMatch(/^\d{8}$/);
  });

  test("keeps boiler and elevator type codes and collapses padded text", () => {
    const violations = parseDobViolationRows(rows);

    expect(violations.some(violation => violation.violationTypeCode === "LBLVIO")).toBe(
      true,
    );
    expect(violations.some(violation => violation.violationTypeCode === "E")).toBe(true);
    for (const violation of violations) {
      if (violation.description !== null) {
        expect(violation.description).not.toMatch(/\s{2,}/);
      }
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseBisPermitRows } from "../src/bisPermits.ts";

// Real DOB Permit Issuance rows (Socrata ipu4-2q9a) for 900 Grand Concourse,
// a 1923 Bronx elevator apartment building (BIN 2002802), recorded 2026-07-05.
// The full history goes back decades and carries boiler (BL) equipment permits.
const rows = JSON.parse(
  readFileSync(new URL("./fixtures/bisPermits-2002802.json", import.meta.url), "utf8"),
);

describe("parseBisPermitRows", () => {
  test("maps each permit onto the normalized shape", () => {
    const permits = parseBisPermitRows(rows);

    expect(permits).toHaveLength(rows.length);
    expect(permits[0].bin).toBe("2002802");
    expect(permits[0].jobNumber).not.toBe("");
    expect(permits[0].raw).toBe(rows[0]);
  });

  test("keeps the work-type code that marks a boiler permit", () => {
    const permits = parseBisPermitRows(rows);

    expect(permits.some(permit => permit.workType === "BL")).toBe(true);
    expect(
      permits.every(
        permit => permit.issuanceDate === null || /\d/.test(permit.issuanceDate),
      ),
    ).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseCatsRows } from "../src/cats.ts";

// Real DEP Clean Air Tracking System registrations (Socrata f4rp-2kvy) for 900
// Grand Concourse (BIN 2002802), recorded 2026-07-05. Two boilers on record: a
// No. 6 oil Titusville cancelled in 1997 and a No. 4 oil Rockmills that expired
// in 2022 - the fuel and vintage signal this dataset exists to provide.
const rows = JSON.parse(
  readFileSync(new URL("./fixtures/cats-2002802.json", import.meta.url), "utf8"),
);

describe("parseCatsRows", () => {
  test("maps each registration onto the normalized shape", () => {
    const permits = parseCatsRows(rows);

    expect(permits).toHaveLength(rows.length);
    expect(permits[0].bin).toBe("2002802");
    expect(permits[0].applicationId).not.toBe("");
    expect(permits[0].make).not.toBeNull();
  });

  test("keeps the registered oil fuel and its service dates", () => {
    const permits = parseCatsRows(rows);

    expect(permits.some(permit => permit.primaryFuel === "NO6FUEL")).toBe(true);
    expect(permits.some(permit => permit.primaryFuel === "NO4FUEL")).toBe(true);
    expect(permits.every(permit => permit.issueDate !== null)).toBe(true);
  });
});

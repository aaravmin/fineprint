import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseHpdComplaintRows } from "../src/hpdComplaints.ts";

// Real HPD complaint problems (Socrata ygpa-z7cr) for 900 Grand Concourse (BBL
// 2024600001), recorded 2026-07-05. Most recent 80 problems, heavy with
// HEAT/HOT WATER - the tenant-side mirror of the violation record.
const rows = JSON.parse(
  readFileSync(
    new URL("./fixtures/hpdComplaints-2024600001.json", import.meta.url),
    "utf8",
  ),
);

describe("parseHpdComplaintRows", () => {
  test("maps each problem onto the normalized shape", () => {
    const complaints = parseHpdComplaintRows(rows);

    expect(complaints).toHaveLength(rows.length);
    expect(complaints[0].bbl).toBe("2024600001");
    expect(complaints[0].complaintId).not.toBe("");
    expect(complaints[0].receivedDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  test("keeps the major category that carries the heat signal", () => {
    const complaints = parseHpdComplaintRows(rows);

    expect(complaints.some(problem => problem.majorCategory === "HEAT/HOT WATER")).toBe(
      true,
    );
  });
});

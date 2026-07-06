import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseBisJobRows } from "../src/bisJobs.ts";

// Real DOB Job Application Filings (Socrata ic3t-wcy2) for 900 Grand Concourse
// (BIN 2002802), recorded 2026-07-05. The job descriptions are the signal that
// downstream code mines for HVAC, boiler, and plumbing work.
const rows = JSON.parse(
  readFileSync(new URL("./fixtures/bisJobs-2002802.json", import.meta.url), "utf8"),
);

describe("parseBisJobRows", () => {
  test("maps each filing onto the normalized shape", () => {
    const jobs = parseBisJobRows(rows);

    expect(jobs).toHaveLength(rows.length);
    expect(jobs[0].bin).toBe("2002802");
    expect(jobs[0].jobNumber).not.toBe("");
    expect(jobs[0].jobType).not.toBeNull();
  });

  test("collapses the padded job description to clean text", () => {
    const jobs = parseBisJobRows(rows);
    const described = jobs.find(
      job => job.description !== null && job.description !== "",
    );

    expect(described).toBeDefined();
    expect(described!.description).not.toMatch(/\s{2,}/);
  });
});

import { describe, expect, test } from "vitest";
import { draftInputFrom } from "../src/draftInput.ts";

// draftInputFrom turns a task row + its building row into the DraftInput a
// policy consumes — including the real-data columns ingest fills (usesJson,
// provenanceJson, emissions, coverage). Pure and testable; the worker just
// calls it.
const taskRow = {
  title: "LL97 — Building Emissions Cap — 350 5 AVENUE",
  kind: "emissions_fine_analysis",
  lawId: "ll97",
  fineEstimateUsd: 1_102_986,
  deadline: { toDate: () => new Date("2027-05-01T00:00:00Z") },
};

const ingestedBuilding = {
  address: "350 5 AVENUE, New York, NY, USA",
  bbl: "1008350041",
  sqft: 2_852_257,
  isAffordable: false,
  annualEmissionsTco2E: 12_096.78,
  usesJson: JSON.stringify([
    { group: "Office", sqft: 2_692_475.1 },
    { group: "Restaurant", sqft: 50_021 },
  ]),
  ll97Covered: true,
  provenanceJson: JSON.stringify([
    {
      field: "annualEmissionsTco2e",
      source: "LL84 benchmarking disclosure",
      detail: "2024 filing",
    },
  ]),
};

describe("draftInputFrom", () => {
  test("carries the real-data columns through to the policy", () => {
    const input = draftInputFrom(taskRow, ingestedBuilding);

    expect(input.bbl).toBe("1008350041");
    expect(input.annualEmissionsTco2e).toBe(12_096.78);
    expect(input.uses).toEqual([
      { group: "Office", sqft: 2_692_475.1 },
      { group: "Restaurant", sqft: 50_021 },
    ]);
    expect(input.ll97Covered).toBe(true);
    expect(input.provenance).toHaveLength(1);
    expect(input.provenance[0].source).toBe("LL84 benchmarking disclosure");
  });

  test("the task deadline converts to a date the policies can render", () => {
    const input = draftInputFrom(taskRow, ingestedBuilding);

    expect(input.deadline?.toISOString()).toBe("2027-05-01T00:00:00.000Z");
  });

  test("a task without a deadline leaves the field undefined", () => {
    const input = draftInputFrom({ ...taskRow, deadline: undefined }, ingestedBuilding);

    expect(input.deadline).toBeUndefined();
  });

  test("a seed building without real-data columns degrades to empty fields", () => {
    const seedBuilding = {
      address: "123 Example Street",
      bbl: undefined,
      sqft: 80_000,
      isAffordable: false,
      annualEmissionsTco2E: undefined,
      usesJson: undefined,
      ll97Covered: undefined,
      provenanceJson: undefined,
    };

    const input = draftInputFrom(taskRow, seedBuilding);

    expect(input.bbl).toBeUndefined();
    expect(input.annualEmissionsTco2e).toBeUndefined();
    expect(input.uses).toEqual([]);
    expect(input.provenance).toEqual([]);
  });

  test("a missing building row still yields a usable input", () => {
    const input = draftInputFrom(taskRow, undefined);

    expect(input.address).toBe("unknown");
    expect(input.sqft).toBe(0);
    expect(input.uses).toEqual([]);
    expect(input.title).toBe(taskRow.title);
  });

  test("corrupt JSON columns degrade to empty, never throw", () => {
    const input = draftInputFrom(taskRow, { ...ingestedBuilding, usesJson: "{not json" });

    expect(input.uses).toEqual([]);
  });
});

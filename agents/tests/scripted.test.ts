import { describe, expect, test } from "vitest";
import { LAWS } from "../../spacetimedb/src/laws.ts";
import { draftScripted } from "../src/policies/scripted.ts";
import type { DraftInput } from "../src/policies/types.ts";

function draftInput(overrides: Partial<DraftInput> = {}): DraftInput {
  return {
    title: "LL97 — Building Emissions Cap — 350 5 AVENUE",
    kind: "emissions_fine_analysis",
    lawId: "ll97",
    address: "350 5 AVENUE, New York, NY, USA",
    sqft: 2_852_257,
    isAffordable: false,
    fineEstimateUsd: 1_102_986,
    deadline: undefined,
    bbl: "1008350041",
    annualEmissionsTco2e: 12_096.78,
    uses: [
      { group: "Office", sqft: 2_692_475.1 },
      { group: "Restaurant", sqft: 50_021 },
    ],
    ll97Covered: true,
    provenance: [
      {
        field: "annualEmissionsTco2e",
        source: "LL84 benchmarking disclosure",
        detail: "2024 filing",
      },
    ],
    ...overrides,
  };
}

describe("draftScripted", () => {
  test("every law in the registry has a real template, not the fallback", () => {
    for (const law of LAWS) {
      const draft = draftScripted(draftInput({ kind: law.kind, lawId: law.id }));

      expect(
        draft,
        `law "${law.id}" (kind "${law.kind}") fell through to triage`,
      ).not.toMatch(/No playbook/);
    }
  });

  test("every draft ends with the human-review disclaimer", () => {
    const kinds = [...LAWS.map(law => law.kind), "unknown_kind"];

    for (const kind of kinds) {
      const draft = draftScripted(draftInput({ kind }));

      expect(draft, `kind "${kind}" is missing the disclaimer`).toMatch(
        /Human review required/,
      );
    }
  });

  test("the LL97 draft names the building and the dollar exposure", () => {
    const draft = draftScripted(draftInput());

    expect(draft).toContain("350 5 AVENUE");
    expect(draft).toContain("$1,102,986");
    expect(draft).toMatch(/\$268 per tCO2e/);
  });

  test("a missing fine estimate renders as TBD, never undefined or NaN", () => {
    const draft = draftScripted(draftInput({ fineEstimateUsd: undefined }));

    expect(draft).toContain("$TBD");
    expect(draft).not.toMatch(/undefined|NaN/);
  });

  test("the benchmarking draft carries the building's square footage", () => {
    const draft = draftScripted(
      draftInput({ kind: "benchmarking_filing", lawId: "ll84", fineEstimateUsd: 2_500 }),
    );

    expect(draft).toContain("2,852,257");
  });

  test("an unknown kind flags for manual triage and names the kind", () => {
    const draft = draftScripted(draftInput({ kind: "mystery_obligation" }));

    expect(draft).toMatch(/No playbook for kind "mystery_obligation"/);
  });

  test("provenance renders as a sources footnote", () => {
    const draft = draftScripted(draftInput());

    expect(draft).toMatch(/Sources:/);
    expect(draft).toMatch(/LL84 benchmarking disclosure \(2024 filing\)/);
  });

  test("no provenance, no footnote", () => {
    const draft = draftScripted(draftInput({ provenance: [] }));

    expect(draft).not.toMatch(/Sources:/);
  });

  test("the LL97 draft states the reported emissions when known", () => {
    const draft = draftScripted(draftInput());

    expect(draft).toMatch(/12,096\.78 tCO2e/);
  });

  test("drafts state the filing deadline when the task has one", () => {
    const draft = draftScripted(
      draftInput({ deadline: new Date("2027-05-01T00:00:00Z") }),
    );

    expect(draft).toMatch(/Deadline: May 1, 2027/);
  });

  test("no deadline, no deadline line", () => {
    const draft = draftScripted(draftInput({ deadline: undefined }));

    expect(draft).not.toMatch(/Deadline:/);
  });

  test("the Article 321 draft states the building's 2030 target from the engine", () => {
    const draft = draftScripted(
      draftInput({
        kind: "prescriptive_measures_plan",
        lawId: "art321",
        isAffordable: true,
        uses: [{ group: "Multifamily Housing", sqft: 80_000 }],
        sqft: 80_000,
        annualEmissionsTco2e: 600,
      }),
    );

    // 0.00334664 x 80,000 sqft = 267.73 tCO2e — the engine's 2030 target.
    expect(draft).toMatch(/267\.73 tCO2e/);
    expect(draft).toMatch(/2030/);
  });

  test("the LL97 draft shows the engine's cliff table when uses are known", () => {
    const draft = draftScripted(
      draftInput({
        uses: [{ group: "Office", sqft: 2_852_257 }],
        annualEmissionsTco2e: 12_096.78,
      }),
    );

    expect(draft).toMatch(/2030-2034/);
    expect(draft).toMatch(/2035-2039/);
  });
});

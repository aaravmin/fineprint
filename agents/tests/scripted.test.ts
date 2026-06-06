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
});

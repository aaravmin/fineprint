import { describe, expect, test } from "vitest";
import { LAWS } from "../../data/laws.ts";
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
    systemDrivers: [],
    measureHighlights: [],
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

  test("drafts carry no boilerplate disclaimers — the review gate enforces sign-off", () => {
    const kinds = [...LAWS.map(law => law.kind), "unknown_kind"];

    for (const kind of kinds) {
      const draft = draftScripted(draftInput({ kind }));

      expect(draft, `kind "${kind}" reintroduced boilerplate`).not.toMatch(
        /Human review required|scripted policy/,
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

  test("an over-cap LL97 draft names the cheapest retrofit path with the disclaimer", () => {
    // Small but very dirty: fines dwarf the per-sqft capex, so the optimizer
    // must pick at least one measure. (At ESB's scale and intensity the honest
    // answer is do-nothing, which is why this fixture is not ESB.)
    const draft = draftScripted(
      draftInput({
        sqft: 50_000,
        uses: [{ group: "Office", sqft: 50_000 }],
        annualEmissionsTco2e: 1_500,
      }),
    );

    expect(draft).toMatch(/Cheapest path to compliance/);
    expect(draft).toMatch(/assumptions, not quotes/);
    expect(draft).toMatch(/avoids \$[\d,.]+ in fines through 2039/);
  });

  test("a compliant building's LL97 draft has no retrofit pitch", () => {
    const draft = draftScripted(
      draftInput({
        uses: [{ group: "Office", sqft: 2_852_257 }],
        annualEmissionsTco2e: 100,
      }),
    );

    expect(draft).not.toMatch(/Cheapest path/);
  });

  test("the LL97 draft leads with the building's emissions drivers and top measures", () => {
    const draft = draftScripted(
      draftInput({
        systemDrivers: [
          {
            system: "heating_plant",
            headline: "No. 4 fuel oil boiler, installed around 1995",
            condition: "failing",
            shareOfEmissions: 0.52,
          },
        ],
        measureHighlights: [
          {
            name: "Cold-climate heat pump conversion",
            targetSystem: "heating_plant",
            capexUsd: 3_300_000,
            estReductionTco2e: 1_527.5,
            why: "The heating plant is a No. 4 fuel oil boiler and reads as failing.",
          },
        ],
      }),
    );

    expect(draft).toMatch(/Emissions drivers/);
    expect(draft).toMatch(/No\. 4 fuel oil boiler/);
    expect(draft).toMatch(/failing/);
    expect(draft).toMatch(/52% of emissions/);
    expect(draft).toMatch(/Building-specific measures/);
    expect(draft).toMatch(/Cold-climate heat pump conversion/);
    expect(draft).toMatch(/\$3,300,000 capex/);
    expect(draft).toMatch(/1,527.5 tCO2e/);
  });

  test("a building with no systems dossier surfaces no drivers section", () => {
    const draft = draftScripted(draftInput());

    expect(draft).not.toMatch(/Emissions drivers/);
    expect(draft).not.toMatch(/Building-specific measures/);
  });
});

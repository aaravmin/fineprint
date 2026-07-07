import { describe, expect, test } from "vitest";
import { taskSpecsForIngest, type TaskSpec } from "../src/taskSpecs.ts";
import type { BuildingProfile } from "../src/laws.ts";

const asOf = new Date("2026-06-06T00:00:00Z");

function profile(overrides: Partial<BuildingProfile> = {}): BuildingProfile {
  return { sqft: 80_000, isAffordable: false, bbl: "1008350041", ...overrides };
}

function fineFor(specs: TaskSpec[], lawId: string): number | null | undefined {
  return specs.find(spec => spec.law_id === lawId)?.fine_estimate_usd;
}

describe("taskSpecsForIngest — fine estimates are honest, never fabricated", () => {
  const address = "350 5th Avenue, Manhattan";

  test("LL97 carries the engine's fine when the pipeline computed one", () => {
    const specs = taskSpecsForIngest(address, profile(), ["ll97"], 1_250_000, asOf);

    expect(fineFor(specs, "ll97")).toBe(1_250_000);
  });

  test("LL97 carries null — not a stub — when the engine had no emissions to price", () => {
    const specs = taskSpecsForIngest(address, profile(), ["ll97"], undefined, asOf);

    expect(fineFor(specs, "ll97")).toBeNull();
  });

  test("Article 321 also carries null when the engine had nothing to price", () => {
    const specs = taskSpecsForIngest(address, profile(), ["art321"], undefined, asOf);

    expect(fineFor(specs, "art321")).toBeNull();
  });

  test("a procedural law carries its flat statutory penalty", () => {
    const specs = taskSpecsForIngest(address, profile(), ["ll84"], undefined, asOf);

    expect(fineFor(specs, "ll84")).toBe(2_000);
  });

  test("laws with no honest dollar figure carry null, not an invented one", () => {
    const specs = taskSpecsForIngest(address, profile(), ["ll87"], undefined, asOf);

    expect(fineFor(specs, "ll87")).toBeNull();
  });
});

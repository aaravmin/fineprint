import { describe, expect, test } from "vitest";
import { computeFine } from "../../engine/src/index.ts";
import { toEngineInput } from "../src/engineBridge.ts";
import type { BuildingFacts } from "../src/types.ts";

// The single conversion point between the data layer's BuildingFacts and
// the engine's BuildingInput. Everything that wants engine math goes
// through here — tools, ingest, dashboard.
const completeFacts: BuildingFacts = {
  bbl: "1008350041",
  bin: "1015862",
  address: "350 5 AVENUE, New York, NY, USA",
  grossFloorAreaSqft: 2_852_257,
  occupancyGroups: [{ group: "Office", sqft: 2_852_257 }],
  annualEmissionsTco2e: 12_096.78,
  isLl97Covered: true,
  isArticle321: false,
  plutoCharacteristics: null,
  openViolations: [],
  provenance: [],
};

describe("toEngineInput", () => {
  test("complete facts convert to an input the engine accepts", () => {
    const { input, missing } = toEngineInput(completeFacts);

    expect(missing).toEqual([]);
    expect(input).not.toBeNull();

    // The proof of proper connection: the engine computes without throwing.
    const result = computeFine(input!, "2030-2034");
    expect(result.annualFineUsd).toBeGreaterThan(0);
  });

  test("the Article 321 flag carries through to the engine pathway", () => {
    const { input } = toEngineInput({ ...completeFacts, isArticle321: true });

    const result = computeFine(input!, "2024-2029");
    expect(result.pathway).toBe("article321");
    expect(result.annualFineUsd).toBe(0);
  });

  test("missing fields are named instead of guessed", () => {
    const { input, missing } = toEngineInput({
      ...completeFacts,
      annualEmissionsTco2e: null,
      occupancyGroups: [],
    });

    expect(input).toBeNull();
    expect(missing).toEqual(["occupancyGroups", "annualEmissionsTco2e"]);
  });

  test("an unknown Article 321 flag defaults to the standard pathway", () => {
    const { input } = toEngineInput({ ...completeFacts, isArticle321: null });

    expect(input!.isArticle321).toBe(false);
  });

  test("a use the engine can't price degrades to null with the use named", () => {
    const { input, missing } = toEngineInput({
      ...completeFacts,
      occupancyGroups: [{ group: "Marina", sqft: 100_000 }],
    });

    expect(input).toBeNull();
    expect(missing.join(" ")).toMatch(/no emissions factor.*Marina/);
  });

  test("use areas exceeding the gross floor area lift the GFA rather than throw", () => {
    // Self-reported use areas can total more than the calculated GFA; the engine
    // rejects that, so the bridge raises the GFA to the summed area. The limit is
    // computed from the per-use areas, so no figure changes.
    const { input } = toEngineInput({
      ...completeFacts,
      grossFloorAreaSqft: 50_000,
      occupancyGroups: [{ group: "Office", sqft: 100_000 }],
    });

    expect(input).not.toBeNull();
    expect(input!.grossFloorAreaSqft).toBe(100_000);
    expect(() => computeFine(input!, "2024-2029")).not.toThrow();
  });
});

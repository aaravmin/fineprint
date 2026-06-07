import { describe, expect, test } from "vitest";
import { dataToolDefinitions, executeDataTool } from "../src/tools.ts";
import type { BuildingFacts } from "../src/types.ts";

// Tool layer for agent workers: Anthropic tool-use definitions plus a
// dispatcher. The lookup is injectable so tests run offline; the fine math
// underneath is the real engine.
const emirateFacts: BuildingFacts = {
  bbl: "1008350041",
  bin: "1015862",
  address: "350 5 AVENUE, New York, NY, USA",
  grossFloorAreaSqft: 2_852_257,
  occupancyGroups: [{ group: "Office", sqft: 2_852_257 }],
  annualEmissionsTco2e: 16_678.22,
  isLl97Covered: true,
  isArticle321: false,
  plutoCharacteristics: null,
  openViolations: [],
  provenance: [{ field: "bbl", source: "NYC GeoSearch" }],
};

const fakeLookup = async () => emirateFacts;

describe("data tools for agents", () => {
  test("definitions follow the Anthropic tool shape", () => {
    const names = dataToolDefinitions.map(tool => tool.name);

    expect(names).toContain("lookup_building");
    expect(names).toContain("assess_building");
    for (const tool of dataToolDefinitions) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema.required).toContain("address");
    }
  });

  test("lookup_building returns the facts as JSON", async () => {
    const reply = await executeDataTool(
      "lookup_building",
      { address: "350 5th Avenue, Manhattan" },
      { lookupBuilding: fakeLookup },
    );
    const parsed = JSON.parse(reply);

    expect(parsed.bbl).toBe("1008350041");
    expect(parsed.provenance).toHaveLength(1);
  });

  test("assess_building adds fine projections from the engine", async () => {
    const reply = await executeDataTool(
      "assess_building",
      { address: "350 5th Avenue, Manhattan" },
      { lookupBuilding: fakeLookup },
    );
    const parsed = JSON.parse(reply);

    expect(parsed.facts.bbl).toBe("1008350041");
    expect(parsed.projections).toHaveLength(3);
    // 2030: office limit 0.002690852 x 2,852,257 sqft = 7,675.43 tCO2e —
    // far under 16,678.22 actual, so the fine must be large and positive.
    expect(parsed.projections[1].period).toBe("2030-2034");
    expect(parsed.projections[1].annualFineUsd).toBeGreaterThan(1_000_000);
  });

  test("a building without emissions data degrades to facts plus a note", async () => {
    const sparse = { ...emirateFacts, annualEmissionsTco2e: null, occupancyGroups: [] };
    const reply = await executeDataTool(
      "assess_building",
      { address: "350 5th Avenue, Manhattan" },
      { lookupBuilding: async () => sparse },
    );
    const parsed = JSON.parse(reply);

    expect(parsed.projections).toBeNull();
    expect(parsed.note).toMatch(/emissions|use splits/i);
  });

  test("an unknown tool name throws with the valid names", async () => {
    await expect(executeDataTool("frobnicate", { address: "x" })).rejects.toThrow(
      /frobnicate.*lookup_building/s,
    );
  });
});

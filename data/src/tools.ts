// Tool layer for AI agents: Anthropic tool-use definitions plus a dispatcher.
// An agent worker passes dataToolDefinitions to the API and routes tool_use
// blocks through executeDataTool; every number in the reply comes from the
// data pipeline and the engine, never from the model.

import { computeAllPeriods, type FineResult } from "../../engine/src/index.ts";
import { toEngineInput } from "./engineBridge.ts";
import { lookupBuilding as realLookupBuilding } from "./lookup.ts";
import type { BuildingFacts } from "./types.ts";

export interface DataToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

const addressInput = {
  type: "object" as const,
  properties: {
    address: {
      type: "string",
      description: 'Street address with borough, e.g. "350 5th Avenue, Manhattan"',
    },
  },
  required: ["address"],
};

export const dataToolDefinitions: DataToolDefinition[] = [
  {
    name: "lookup_building",
    description:
      "Look up a NYC building across public datasets: BBL, floor area, use splits, " +
      "reported emissions, LL97 coverage, and Article 321 status, with the source " +
      "of every field. Use when you need building facts.",
    input_schema: addressInput,
  },
  {
    name: "assess_building",
    description:
      "Full LL97 exposure assessment for a NYC building: the facts plus exact fine " +
      "projections for 2024-2029, 2030-2034, and 2035-2039 computed by the fine " +
      "engine. Use when the question is about penalties, compliance, or dollars.",
    input_schema: addressInput,
  },
];

interface ToolDependencies {
  lookupBuilding?: (address: string) => Promise<BuildingFacts>;
}

export async function executeDataTool(
  name: string,
  input: { address: string },
  deps: ToolDependencies = {},
): Promise<string> {
  const lookup = deps.lookupBuilding ?? realLookupBuilding;

  if (name === "lookup_building") {
    return JSON.stringify(await lookup(input.address));
  }

  if (name === "assess_building") {
    return JSON.stringify(await assessBuilding(await lookup(input.address)));
  }

  const validNames = dataToolDefinitions.map(tool => tool.name).join(", ");
  throw new Error(`"${name}" is not a data tool; valid tools are ${validNames}`);
}

interface Assessment {
  facts: BuildingFacts;
  projections: FineResult[] | null;
  note: string | null;
}

function assessBuilding(facts: BuildingFacts): Assessment {
  const { input, missing } = toEngineInput(facts);

  if (!input) {
    return {
      facts,
      projections: null,
      note:
        `Fine projections unavailable: the city has no ${missing.join(", ")} ` +
        "for this building (usually a missing LL84 filing — emissions and " +
        "use splits are unknown). The facts above are still sourced.",
    };
  }

  return {
    facts,
    projections: computeAllPeriods(input),
    note: null,
  };
}

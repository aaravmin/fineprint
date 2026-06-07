// Tool layer for AI agents: Anthropic tool-use definitions plus a dispatcher.
// An agent worker passes dataToolDefinitions to the API and routes tool_use
// blocks through executeDataTool; every number in the reply comes from the
// data pipeline and the engine, never from the model.

import { computeAllPeriods, type FineResult } from "../../engine/src/index.ts";
import {
  type Article321Assessment,
  type RetrofitAssessment,
} from "../../engine/src/retrofit.ts";
import { toEngineInput } from "./engineBridge.ts";
import { assessObligations, type Obligation } from "./obligations.ts";
import {
  buildCompliancePlan,
  proceduralPenaltySavings,
  type CompliancePlan,
} from "./compliancePlan.ts";
import { planRetrofit, type MeasureExclusion } from "./retrofit.ts";
import { retrieveLawChunks } from "./ask.ts";
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
  {
    name: "ask_law",
    description:
      "Retrieve the relevant passages of LL97 statute and DOB rule text for a " +
      "legal question: limits, coefficients, penalties, mitigation, Article 321. " +
      "Returns source-verified chunks with citations; answer only from them.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description:
            'The legal question, e.g. "what is the penalty per ton over the limit?"',
        },
      },
      required: ["question"],
    },
  },
];

interface ToolDependencies {
  lookupBuilding?: (address: string) => Promise<BuildingFacts>;
}

export async function executeDataTool(
  name: string,
  input: { address?: string; question?: string },
  deps: ToolDependencies = {},
): Promise<string> {
  const lookup = deps.lookupBuilding ?? realLookupBuilding;

  if (name === "lookup_building") {
    return JSON.stringify(await lookup(requireField(input.address, "address")));
  }

  if (name === "assess_building") {
    return JSON.stringify(
      await assessBuilding(await lookup(requireField(input.address, "address"))),
    );
  }

  if (name === "ask_law") {
    const chunks = retrieveLawChunks(requireField(input.question, "question"));
    return JSON.stringify({
      instruction:
        chunks.length > 0
          ? "Answer only from these chunks. Cite the source and url for every claim."
          : "The corpus does not cover this question. Say so; do not answer from memory.",
      chunks,
    });
  }

  const validNames = dataToolDefinitions.map(tool => tool.name).join(", ");
  throw new Error(`"${name}" is not a data tool; valid tools are ${validNames}`);
}

function requireField(value: string | undefined, field: string): string {
  if (!value) {
    throw new Error(`tool call is missing its "${field}" input`);
  }
  return value;
}

interface Assessment {
  facts: BuildingFacts;
  // The headline: one plan covering every law, each obligation disposed of once.
  compliancePlan: CompliancePlan;
  obligations: Obligation[];
  projections: FineResult[] | null;
  // "standard" trades capex against fines; "article321" minimizes capex to
  // clear the 2030 target. The shape of retrofit follows the pathway.
  retrofitPathway: "standard" | "article321" | null;
  retrofit: RetrofitAssessment | Article321Assessment | null;
  // Measures dropped because the building's record shows they are already done,
  // and the equipment findings behind the plan. Empty when no profile exists.
  retrofitExcluded: MeasureExclusion[];
  retrofitFindings: string[];
  note: string | null;
}

function assessBuilding(facts: BuildingFacts): Assessment {
  const compliancePlan = buildCompliancePlan(facts);
  const obligations = assessObligations(facts).obligations;
  const { input, missing } = toEngineInput(facts);

  if (!input) {
    return {
      facts,
      compliancePlan,
      obligations,
      projections: null,
      retrofitPathway: null,
      retrofit: null,
      retrofitExcluded: [],
      retrofitFindings: [],
      note:
        `Fine projections unavailable: the city has no ${missing.join(", ")} ` +
        "for this building (usually a missing LL84 filing — emissions and " +
        "use splits are unknown). The facts above are still sourced.",
    };
  }

  const plan = planRetrofit(facts, {
    proceduralPenaltySavingsByLaw: proceduralPenaltySavings(obligations),
  });

  return {
    facts,
    compliancePlan,
    obligations,
    projections: computeAllPeriods(input),
    retrofitPathway: plan?.pathway ?? null,
    retrofit: plan?.assessment ?? null,
    retrofitExcluded: plan?.excluded ?? [],
    retrofitFindings: plan?.findings ?? [],
    note: null,
  };
}

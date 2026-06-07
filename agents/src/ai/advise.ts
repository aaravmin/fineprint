// Board-summary narration: purely generative. The assessment — facts, fine
// projections, retrofit optimization — arrives as data-tool output; the model
// explains it for an owner and may not produce a number of its own. Higher
// stakes than fleet drafting, so the default model is Opus.

import { executeDataTool } from "../../../data/src/tools.ts";
import type { CreateMessageParams, ModelTurn } from "../policies/llm.ts";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

export interface AdviseDeps {
  createMessage: (params: CreateMessageParams) => Promise<ModelTurn>;
  assess: (address: string) => Promise<string>;
}

export async function adviseBoardSummary(
  address: string,
  deps: Partial<AdviseDeps> = {},
): Promise<string> {
  const assess =
    deps.assess ?? (target => executeDataTool("assess_building", { address: target }));
  const createMessage = deps.createMessage ?? (await realCreateMessage());

  const assessment = await assess(address);

  const turn = await createMessage({
    model: MODEL,
    max_tokens: 16_000,
    system: ADVISE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Assessment data for ${address}:\n${assessment}\n\nWrite the board summary.`,
      },
    ],
    tools: [],
  });

  const summary = turn.content
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n")
    .trim();

  if (!summary) {
    throw new Error("model returned an empty summary");
  }
  return summary;
}

const ADVISE_SYSTEM = [
  "You are presenting a NYC building's compliance position to its owner in one page.",
  "Every number you write must appear verbatim in the assessment data: quote it,",
  "never compute, total, or extrapolate. Structure: current exposure in dollars,",
  "the cheapest path the optimizer found (name its measures and note the figures",
  "are assumptions, not quotes), then the first three concrete actions.",
  "Check retrofitPathway: 'standard' buildings trade capex against $268/tCO2e fines",
  "(read retrofit.best); 'article321' buildings instead minimize capex to clear the",
  "2030 target (read retrofit.cheapestCompliantPlan, and say so if it is null;",
  "the prescribed-measures path is then required).",
  "Ground the advice in this building's own equipment: quote the retrofitFindings",
  "(its heating fuel, boilers, efficiency tier) and, when the optimizer excluded a",
  "measure because the record shows it is already done, say so by name. Cover the",
  "procedural obligations too: name each filing that is due and its deadline.",
  "Use compliancePlan as the spine: each obligation has exactly one disposition,",
  "so present each law once. When compliancePlan.crossCredits says a measure also",
  "clears another law (e.g. LED lighting also satisfies LL88), say so rather than",
  "listing that law as separate work.",
  "Where the data lacks a number, say so plainly.",
  "Style: plain declarative sentences, no em dashes, no AI disclaimers.",
].join(" ");

async function realCreateMessage(): Promise<AdviseDeps["createMessage"]> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  return params =>
    client.messages.create(
      params as Parameters<typeof client.messages.create>[0],
    ) as Promise<ModelTurn>;
}

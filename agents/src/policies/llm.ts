// LLM drafting policy, enabled only when USE_LLM=true and a key is present.
// A tool-using loop: the model pulls sourced building facts and engine fine
// numbers through the data package's tools — every number in the draft comes
// from a tool result, never from the model's arithmetic. Falls back to the
// scripted policy on any error; the demo must never stall on an API.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dataToolDefinitions, executeDataTool } from "../../../data/src/tools.ts";
import { draftScripted } from "./scripted.ts";
import type { DraftInput } from "./types.ts";

// The worker fleet drafts many small documents; Haiku keeps that cheap.
// Override with ANTHROPIC_MODEL=claude-opus-4-8 for higher-stakes drafting.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
const MAX_TOOL_ROUNDS = 6;

// Structural slices of the SDK's request/response shapes — kept minimal so
// tests can fake the client without importing the SDK.
export interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export interface ModelTurn {
  stop_reason: string | null;
  content: ContentBlock[];
}

export interface CreateMessageParams {
  model: string;
  max_tokens: number;
  system: string;
  messages: unknown[];
  tools: unknown[];
}

export interface LlmDeps {
  createMessage: (params: CreateMessageParams) => Promise<ModelTurn>;
  executeTool: (
    name: string,
    input: { address?: string; question?: string },
  ) => Promise<string>;
}

export async function draftLlm(input: DraftInput, deps?: LlmDeps): Promise<string> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn("[llm] USE_LLM=true but no ANTHROPIC_API_KEY; using scripted policy");
      return cachedDraft(input) ?? draftScripted(input);
    }

    const draft = await draftWithTools(input, deps ?? (await realDeps()));
    writeDraftCache(input, draft);
    return draft;
  } catch (error) {
    console.warn(
      `[llm] drafting failed (${(error as Error).message}); using scripted policy`,
    );
    return cachedDraft(input) ?? draftScripted(input);
  }
}

// Replayable drafts so the demo survives a dead API: every good LLM draft is
// written to agents/cache/llm/, and failures serve the cached copy (marked)
// before degrading to the scripted policy.
function draftCachePath(input: DraftInput): string {
  const dir =
    process.env.FINEPRINT_LLM_CACHE_DIR ??
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "cache", "llm");
  const slug = input.bbl ?? input.address.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return join(dir, `${input.kind}-${slug}.md`);
}

function writeDraftCache(input: DraftInput, draft: string): void {
  try {
    const path = draftCachePath(input);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, draft);
  } catch {
    // A read-only disk must never break drafting.
  }
}

function cachedDraft(input: DraftInput): string | null {
  try {
    const cached = readFileSync(draftCachePath(input), "utf8");
    console.warn(`[llm] serving cached draft for ${input.kind}`);
    return `${cached}\n\n[cached] Replayed from an earlier LLM draft; the API was unavailable.`;
  } catch {
    return null;
  }
}

export async function draftWithTools(input: DraftInput, deps: LlmDeps): Promise<string> {
  const messages: unknown[] = [{ role: "user", content: taskBrief(input) }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const turn = await deps.createMessage({
      model: MODEL,
      max_tokens: 16_000,
      system: SYSTEM_PROMPT,
      messages,
      tools: dataToolDefinitions,
    });

    if (turn.stop_reason !== "tool_use") {
      const draft = turn.content
        .filter(block => block.type === "text")
        .map(block => block.text ?? "")
        .join("\n")
        .trim();
      if (!draft) {
        throw new Error("model returned an empty draft");
      }
      return draft;
    }

    messages.push({ role: "assistant", content: turn.content });
    messages.push({ role: "user", content: await runRequestedTools(turn, deps) });
  }

  throw new Error(`drafting exceeded ${MAX_TOOL_ROUNDS} tool rounds`);
}

async function runRequestedTools(turn: ModelTurn, deps: LlmDeps): Promise<unknown[]> {
  const results: unknown[] = [];

  for (const block of turn.content) {
    if (block.type !== "tool_use") continue;

    try {
      const result = await deps.executeTool(
        block.name ?? "",
        block.input as { address?: string; question?: string },
      );
      results.push({ type: "tool_result", tool_use_id: block.id, content: result });
    } catch (error) {
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: (error as Error).message,
        is_error: true,
      });
    }
  }

  return results;
}

const SYSTEM_PROMPT = [
  "You are a NYC building-compliance analyst drafting work product for human review.",
  "Use the tools for every building fact and every dollar figure: assess_building",
  "returns sourced facts plus exact fine projections computed by the fine engine.",
  "Never calculate penalties yourself — quote the tool's numbers and cite the",
  "sources from its provenance. No derived figures either: no cumulative totals,",
  "multiplications, or extrapolations of the tool's numbers.",
  "If a tool errors, say what is unknown rather than",
  "guessing. Write a concrete, numbered action plan (3-6 steps) with a one-line",
  "cost/risk note.",
  'End every draft with: "Draft prepared by AI. Human review required before any filing."',
].join(" ");

function taskBrief(input: DraftInput): string {
  return [
    `Obligation: ${input.title}`,
    `Law: ${input.lawId}, kind: ${input.kind}`,
    `Building: ${input.address}` + (input.bbl ? ` (BBL ${input.bbl})` : ""),
    input.deadline ? `Deadline: ${input.deadline.toISOString().slice(0, 10)}` : "",
    input.isAffordable ? "Pathway: Article 321 (affordable housing)." : "",
    "",
    "Draft the compliance plan for this obligation. Every number in the draft",
    "must appear verbatim in a tool result — no totals, ratios, or estimates of",
    'your own. Where a cost is unknown, write "requires quote".',
  ]
    .filter(Boolean)
    .join("\n");
}

let cachedCreateMessage: LlmDeps["createMessage"] | null = null;

async function realDeps(): Promise<LlmDeps> {
  if (!cachedCreateMessage) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    cachedCreateMessage = params =>
      client.messages.create(
        params as Parameters<typeof client.messages.create>[0],
      ) as Promise<ModelTurn>;
  }

  return {
    createMessage: cachedCreateMessage,
    executeTool: (name, input) => executeDataTool(name, input),
  };
}

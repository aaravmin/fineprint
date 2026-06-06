// LLM drafting policy, enabled only when USE_LLM=true and a key is present.
// Falls back to the scripted policy on any error — the demo must never stall on an API.
import { draftScripted } from "./scripted.ts";
import type { DraftInput } from "./types.ts";

export async function draftLlm(input: DraftInput): Promise<string> {
  try {
    if (process.env.ANTHROPIC_API_KEY) return await draftClaude(input);
    console.warn(
      "[llm] USE_LLM=true but no ANTHROPIC_API_KEY; using scripted policy",
    );
    return draftScripted(input);
  } catch (err) {
    console.warn(
      `[llm] drafting failed (${(err as Error).message}); using scripted policy`,
    );
    return draftScripted(input);
  }
}

async function draftClaude(input: DraftInput): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: [
          `You are a NYC building compliance analyst. Draft a short, concrete action plan.`,
          `Obligation: ${input.title}`,
          `Law: ${input.lawId}, kind: ${input.kind}`,
          `Building: ${input.address}, ${input.sqft.toLocaleString()} sqft` +
            (input.isAffordable ? ", affordable housing" : ""),
          input.fineEstimateUsd !== undefined
            ? `Estimated exposure: $${input.fineEstimateUsd.toLocaleString()}/yr`
            : `No monetary fine modeled.`,
          ``,
          `Output: a numbered 3-5 step plan plus a one-line cost/risk note.`,
          `End with: "Draft prepared by AI. Human review required before any filing."`,
        ].join("\n"),
      },
    ],
  });
  const text = msg.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  if (!text.trim()) throw new Error("empty completion");
  return text;
}

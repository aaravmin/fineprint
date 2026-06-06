// LLM drafting policy, enabled only when USE_LLM=true and a key is present.
// Falls back to the scripted policy on any error — the demo must never stall on an API.
import { draftScripted } from "./scripted.ts";
import type { DraftInput } from "./types.ts";

// Law-specific system prompts give the model the right frame of reference before
// it sees building details. Generic guidance produces generic drafts.
const SYSTEM_PROMPTS: Record<string, string> = {
  emissions_fine_analysis: `You are an NYC LL97 compliance specialist. Analyze the building's carbon emissions against its statutory cap and draft a concrete penalty mitigation plan. Lead with the emissions gap if verified data is available, then sequence the interventions by cost-effectiveness: controls and scheduling first, then plant upgrades, then Good Faith Efforts deferral as a last resort. Be precise about dollar exposure.`,

  prescriptive_measures_plan: `You are an NYC LL97 Article 321 affordable housing compliance advisor. The building qualifies for the prescriptive pathway rather than the emissions cap. Draft a plan that covers HPD eligibility verification, the 13-measure survey, and the certification filing timeline. Flag which measures are typically completed at low cost vs. which require capital planning.`,

  benchmarking_filing: `You are an NYC LL84 benchmarking specialist. Draft a step-by-step annual filing plan using Energy Star Portfolio Manager. Include utility whole-building aggregate data request lead times, the most common ESPM data-quality errors to catch before submission, and the NYC portal deadline and confirmation-archiving steps.`,

  audit_filing: `You are an NYC LL87 energy audit and retro-commissioning specialist. Draft a plan covering auditor selection (ASHRAE Level II), the retro-commissioning base-building systems checklist, and the EER filing in DOB NOW. Flag the most common compliance gaps for buildings of this size and use mix.`,

  facade_inspection: `You are an NYC LL11/FISP facade inspection specialist. Draft a plan covering QEWI selection, close-up inspection scheduling, SWARMP vs Safe vs Unsafe classification criteria, and the DOB NOW Safety filing. Advise on when a sidewalk shed is mandatory and how to minimize its duration to control cost.`,

  lighting_submetering_plan: `You are an NYC LL88 lighting upgrades and submetering compliance specialist. Draft a plan covering fixture survey against NYCECC standards, identification of tenant spaces over 5,000 sqft that lack submeters, and a staged installation strategy aligned with tenant turnover to minimize disruption and cost.`,
};

export async function draftLlm(input: DraftInput): Promise<string> {
  try {
    if (process.env.ANTHROPIC_API_KEY) return await draftClaude(input);
    console.warn("[llm] USE_LLM=true but no ANTHROPIC_API_KEY; using scripted policy");
    return draftScripted(input);
  } catch (error) {
    console.warn(
      `[llm] drafting failed (${(error as Error).message}); using scripted policy`,
    );
    return draftScripted(input);
  }
}

async function draftClaude(input: DraftInput): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const system = SYSTEM_PROMPTS[input.kind] ?? `You are an NYC building compliance analyst.`;

  const contextLines = [
    `Obligation: ${input.title}`,
    `Law: ${input.lawId}, kind: ${input.kind}`,
    `Building: ${input.address}, ${input.sqft.toLocaleString()} sqft` +
      (input.isAffordable ? ", affordable housing" : ""),
  ];

  if (input.annualEmissionsTco2e !== undefined) {
    contextLines.push(`Verified annual emissions: ${input.annualEmissionsTco2e.toFixed(1)} tCO2e/yr`);
  }

  if (input.usesJson) {
    const uses: Array<{ group: string; sqft: number }> = JSON.parse(input.usesJson);
    if (uses.length > 0) {
      const summary = uses.map(u => `${u.group}: ${u.sqft.toLocaleString()} sqft`).join(", ");
      contextLines.push(`Use breakdown: ${summary}`);
    }
  }

  if (input.fineEstimateUsd !== undefined) {
    contextLines.push(`Estimated annual exposure: $${input.fineEstimateUsd.toLocaleString()}`);
  } else {
    contextLines.push(`No monetary fine modeled.`);
  }

  contextLines.push(
    ``,
    `Output: a numbered 3-5 step concrete action plan plus a one-line cost/risk note.`,
    `End with: "Draft prepared by AI. Human review required before any filing."`,
  );

  const completion = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 700,
    system,
    messages: [{ role: "user", content: contextLines.join("\n") }],
  });

  const text = completion.content
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("\n");

  if (!text.trim()) throw new Error("empty completion");
  return text;
}

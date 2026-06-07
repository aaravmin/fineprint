import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { draftLlm } from "../src/policies/llm.ts";
import type { DraftInput } from "../src/policies/types.ts";
import type { LlmDeps } from "../src/policies/llm.ts";

const input: DraftInput = {
  title: "LL97 — Building Emissions Cap — 350 5 AVENUE",
  kind: "emissions_fine_analysis",
  lawId: "ll97",
  address: "350 5 AVENUE, New York, NY, USA",
  sqft: 2_852_257,
  isAffordable: false,
  fineEstimateUsd: 0,
  deadline: undefined,
  bbl: "1008350041",
  annualEmissionsTco2e: 12_096.78,
  uses: [{ group: "Office", sqft: 2_852_257 }],
  ll97Covered: true,
  provenance: [],
};

function goodDeps(text: string): LlmDeps {
  return {
    createMessage: async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text }],
    }),
    executeTool: async () => "{}",
  };
}

const brokenDeps: LlmDeps = {
  createMessage: async () => {
    throw new Error("API is down");
  },
  executeTool: async () => "{}",
};

let cacheDir: string;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "fineprint-llm-cache-"));
  process.env.FINEPRINT_LLM_CACHE_DIR = cacheDir;
  process.env.ANTHROPIC_API_KEY = "test-key-so-draftLlm-tries-the-loop";
});

afterEach(() => {
  delete process.env.FINEPRINT_LLM_CACHE_DIR;
  delete process.env.ANTHROPIC_API_KEY;
  rmSync(cacheDir, { recursive: true, force: true });
});

describe("LLM draft cache", () => {
  test("a successful draft leaves a replayable file", async () => {
    const draft = await draftLlm(input, goodDeps("LL97 plan body"));

    expect(draft).toBe("LL97 plan body");
    const cached = join(cacheDir, "emissions_fine_analysis-1008350041.md");
    expect(existsSync(cached)).toBe(true);
    expect(readFileSync(cached, "utf8")).toBe("LL97 plan body");
  });

  test("a dead API replays the cached draft instead of the scripted fallback", async () => {
    await draftLlm(input, goodDeps("the good cached draft"));

    const draft = await draftLlm(input, brokenDeps);

    expect(draft).toContain("the good cached draft");
    expect(draft).toContain("[cached]");
  });

  test("a dead API with no cache still falls back to the scripted policy", async () => {
    const draft = await draftLlm(input, brokenDeps);

    // The scripted template's header proves the fallback ran.
    expect(draft).toMatch(/LL97 EXPOSURE ANALYSIS/);
  });
});

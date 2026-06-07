import { describe, expect, test } from "vitest";
import { adviseBoardSummary } from "../src/ai/advise.ts";
import type { CreateMessageParams, ModelTurn } from "../src/policies/llm.ts";

// The narrator is generative only: the assessment JSON arrives as input and
// the model must not add numbers. Both dependencies are faked so the test
// runs offline.
const fakeAssessment = JSON.stringify({
  facts: { bbl: "1008350041" },
  projections: [{ period: "2030-2034", annualFineUsd: 1_102_986.27 }],
  retrofit: { best: { measureIds: ["hvac_controls"] } },
});

function fakeTurn(text: string): ModelTurn {
  return { stop_reason: "end_turn", content: [{ type: "text", text }] };
}

describe("adviseBoardSummary", () => {
  test("feeds the assessment to the model and returns its summary", async () => {
    let seenParams: CreateMessageParams | null = null;

    const summary = await adviseBoardSummary("350 5th Avenue, Manhattan", {
      assess: async () => fakeAssessment,
      createMessage: async params => {
        seenParams = params;
        return fakeTurn("Your 2030 exposure is $1,102,986.27.");
      },
    });

    expect(summary).toBe("Your 2030 exposure is $1,102,986.27.");
    expect(JSON.stringify(seenParams!.messages)).toContain("1008350041");
    expect(seenParams!.system).toMatch(/verbatim/i);
  });

  test("an empty model reply is an error, never a blank summary", async () => {
    await expect(
      adviseBoardSummary("350 5th Avenue, Manhattan", {
        assess: async () => fakeAssessment,
        createMessage: async () => fakeTurn("   "),
      }),
    ).rejects.toThrow(/empty/);
  });
});

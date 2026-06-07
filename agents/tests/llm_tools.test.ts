import { describe, expect, test, vi } from "vitest";
import { draftWithTools, type LlmDeps } from "../src/policies/llm.ts";
import type { DraftInput } from "../src/policies/types.ts";

// The tool-using agent loop: the model asks for facts through tools, the
// dispatcher answers, and the final draft is written from tool results.
// The client is faked here; the dispatcher contract is the data package's
// executeDataTool, tested in its own workspace.
function draftInput(overrides: Partial<DraftInput> = {}): DraftInput {
  return {
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
    ...overrides,
  };
}

function toolUseTurn(name: string, input: unknown, id = "tool_1") {
  return {
    stop_reason: "tool_use",
    content: [
      { type: "text", text: "Let me pull the assessment." },
      { type: "tool_use", id, name, input },
    ],
  };
}

const finalTurn = {
  stop_reason: "end_turn",
  content: [
    {
      type: "text",
      text: "EXPOSURE: $1,185,037/yr from 2030.\nNext step: commission an energy model.",
    },
  ],
};

describe("draftWithTools", () => {
  test("executes requested tools and feeds results back to the model", async () => {
    const createMessage = vi
      .fn()
      .mockResolvedValueOnce(
        toolUseTurn("assess_building", { address: "350 5th Avenue" }),
      )
      .mockResolvedValueOnce(finalTurn);
    const executeTool = vi
      .fn()
      .mockResolvedValue('{"projections":[{"annualFineUsd":1185037}]}');

    const draft = await draftWithTools(draftInput(), { createMessage, executeTool });

    expect(executeTool).toHaveBeenCalledWith("assess_building", {
      address: "350 5th Avenue",
    });
    expect(draft).toContain("$1,185,037");

    // The second model call must carry the tool result back.
    const secondCallMessages = createMessage.mock.calls[1][0].messages;
    const lastMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(JSON.stringify(lastMessage)).toContain("1185037");
    expect(JSON.stringify(lastMessage)).toContain("tool_1");
  });

  test("offers the data tools to the model on every call", async () => {
    const createMessage = vi.fn().mockResolvedValue(finalTurn);
    const executeTool = vi.fn();

    await draftWithTools(draftInput(), { createMessage, executeTool });

    const tools = createMessage.mock.calls[0][0].tools;
    expect(tools.map((tool: { name: string }) => tool.name)).toEqual(
      expect.arrayContaining(["lookup_building", "assess_building"]),
    );
  });

  test("a failing tool reports the error to the model instead of crashing", async () => {
    const createMessage = vi
      .fn()
      .mockResolvedValueOnce(toolUseTurn("lookup_building", { address: "nowhere" }))
      .mockResolvedValueOnce(finalTurn);
    const executeTool = vi
      .fn()
      .mockRejectedValue(new Error('no NYC address found for "nowhere"'));

    const draft = await draftWithTools(draftInput(), { createMessage, executeTool });

    const secondCallMessages = createMessage.mock.calls[1][0].messages;
    const lastMessage = JSON.stringify(secondCallMessages[secondCallMessages.length - 1]);
    expect(lastMessage).toContain("no NYC address found");
    expect(lastMessage).toContain("is_error");
    expect(draft).toContain("EXPOSURE");
  });

  test("stops a runaway tool loop after the round cap", async () => {
    const createMessage = vi
      .fn()
      .mockResolvedValue(toolUseTurn("assess_building", { address: "350 5th Avenue" }));
    const executeTool = vi.fn().mockResolvedValue("{}");

    await expect(
      draftWithTools(draftInput(), { createMessage, executeTool }),
    ).rejects.toThrow(/tool rounds/i);

    expect(createMessage.mock.calls.length).toBeLessThanOrEqual(7);
  });

  test("an empty final draft is an error, not a silent blank submission", async () => {
    const createMessage = vi.fn().mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "   " }],
    });

    await expect(
      draftWithTools(draftInput(), { createMessage, executeTool: vi.fn() }),
    ).rejects.toThrow(/empty/i);
  });
});

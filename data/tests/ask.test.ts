import { describe, expect, test } from "vitest";
import { retrieveLawChunks } from "../src/ask.ts";
import { executeDataTool, dataToolDefinitions } from "../src/tools.ts";

describe("retrieveLawChunks", () => {
  test("the penalty question surfaces the $268 rule chunk first", () => {
    const chunks = retrieveLawChunks("what is the penalty per ton over the limit");

    expect(chunks[0].id).toBe("rule-103-14-h-penalty");
    expect(chunks[0].text).toContain("$268");
    expect(chunks[0].url).toMatch(/^https:/);
  });

  test("an Article 321 question surfaces the prescriptive measures", () => {
    const chunks = retrieveLawChunks(
      "what prescriptive energy conservation measures must affordable housing implement",
    );

    expect(chunks.map(chunk => chunk.id)).toContain("statute-28-321.2.2-measures");
  });

  test("every chunk carries a source and url", () => {
    for (const chunk of retrieveLawChunks("emissions limits", 10)) {
      expect(chunk.source.length).toBeGreaterThan(5);
      expect(chunk.url).toMatch(/^https:/);
    }
  });

  test("an off-topic question returns nothing to cite", () => {
    expect(retrieveLawChunks("parking zoning variance hardship waiver")).toEqual([]);
  });
});

describe("ask_law tool", () => {
  test("is defined with a question input", () => {
    const askLaw = dataToolDefinitions.find(tool => tool.name === "ask_law");

    expect(askLaw).toBeDefined();
    expect(askLaw!.input_schema.required).toContain("question");
  });

  test("returns chunks plus the answer-only-from-chunks instruction", async () => {
    const reply = JSON.parse(
      await executeDataTool("ask_law", { question: "penalty per ton over the limit" }),
    );

    expect(reply.instruction).toMatch(/only from these chunks/i);
    expect(reply.chunks.length).toBeGreaterThan(0);
    expect(reply.chunks[0].source).toBeDefined();
  });

  test("says so when the corpus has nothing", async () => {
    const reply = JSON.parse(
      await executeDataTool("ask_law", { question: "zoning variance hardship waiver" }),
    );

    expect(reply.chunks).toEqual([]);
    expect(reply.instruction).toMatch(/does not cover/i);
  });
});

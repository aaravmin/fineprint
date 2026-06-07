// Cited answers from the LL97 statute and rule corpus, straight to stdout.
// Usage: npx tsx agents/scripts/ask.ts "what is the penalty per ton over the limit?"

import { dataToolDefinitions, executeDataTool } from "../../data/src/tools.ts";

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error('usage: npx tsx agents/scripts/ask.ts "<question about LL97>"');
  process.exit(1);
}

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
const MAX_TOOL_ROUNDS = 3;

const SYSTEM = [
  "You answer questions about NYC Local Law 97 using the ask_law tool.",
  "Answer only from the chunks the tool returns, citing each claim's source",
  "and url inline. If the tool says the corpus does not cover the question,",
  "say exactly that and stop — never answer from memory.",
].join(" ");

const askLawTool = dataToolDefinitions.filter(tool => tool.name === "ask_law");

const { default: Anthropic } = await import("@anthropic-ai/sdk");
const client = new Anthropic();

const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
  const turn = await client.messages.create({
    model: MODEL,
    max_tokens: 16_000,
    system: SYSTEM,
    messages,
    tools: askLawTool as Anthropic.Tool[],
  });

  if (turn.stop_reason !== "tool_use") {
    const answer = turn.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("\n")
      .trim();
    console.log(answer || "(no answer)");
    process.exit(0);
  }

  messages.push({ role: "assistant", content: turn.content });

  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const block of turn.content) {
    if (block.type !== "tool_use") continue;
    try {
      const result = await executeDataTool(
        block.name,
        block.input as { question?: string },
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
  messages.push({ role: "user", content: results });
}

console.error(`no answer after ${MAX_TOOL_ROUNDS} tool rounds`);
process.exit(1);

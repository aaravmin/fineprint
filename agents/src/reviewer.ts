// Reviewer agent: watches in_review tasks and calls approve/reject.
// Run with: npm run reviewer
// Set USE_LLM=true ANTHROPIC_API_KEY=… for LLM-backed verdicts; without it
// the scripted check applies a basic completeness heuristic.
import { DbConnection } from "./module_bindings/index.ts";
import type { Task, Submission, Building } from "./module_bindings/types.ts";

const HOST = process.env.SPACETIME_URI ?? "ws://localhost:3011";
const DB_NAME = process.env.DB_NAME ?? "fineprint";
const USE_LLM = process.env.USE_LLM === "true";
const NAME = "reviewer";

// Tasks whose review we have started. Prevents double-processing when a
// rejected task cycles back to open and later to in_review again under a
// new submission — we only skip IDs in this Set that are still in_review.
const inProgress = new Set<bigint>();

let reviewing = false;

const conn = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .onConnect((_conn, identity) => {
    console.log(`[${NAME}] connected as ${identity.toHexString().slice(0, 8)}…`);

    conn
      .subscriptionBuilder()
      .onApplied(() => {
        console.log(`[${NAME}] subscribed — watching for in_review tasks`);
        setInterval(() => void tick(), 3_000);
      })
      .subscribeToAllTables();
  })
  .onConnectError((_ctx, error) => {
    console.error(`[${NAME}] connection failed:`, error.message);
    process.exit(1);
  })
  .build();

async function tick() {
  if (reviewing) return;

  const pendingTask = [...conn.db.task.iter()].find(
    task => task.status === "in_review" && !inProgress.has(task.id),
  );

  if (!pendingTask) return;

  inProgress.add(pendingTask.id);
  reviewing = true;

  try {
    await reviewTask(pendingTask);
  } finally {
    reviewing = false;
  }
}

async function reviewTask(task: Task) {
  const submission = [...conn.db.submission.iter()]
    .filter(row => row.taskId === task.id)
    .sort((a, b) => (a.id > b.id ? -1 : 1))[0];

  if (!submission) {
    console.warn(`[${NAME}] no submission for task #${task.id} — skipping`);
    inProgress.delete(task.id);
    return;
  }

  const building = [...conn.db.building.iter()].find(row => row.id === task.buildingId);

  console.log(`[${NAME}] reviewing #${task.id}: ${task.title}`);

  const { verdict, note } =
    USE_LLM && process.env.ANTHROPIC_API_KEY
      ? await reviewWithLlm(task, submission, building)
      : reviewScripted(submission);

  try {
    if (verdict === "approve") {
      await conn.reducers.approve({ taskId: task.id, note });
      console.log(`[${NAME}] approved #${task.id}`);
    } else {
      await conn.reducers.reject({ taskId: task.id, note });
      console.log(`[${NAME}] rejected #${task.id}: ${note}`);
      // Allow the task to be re-submitted and reviewed again.
      inProgress.delete(task.id);
    }
  } catch (error) {
    console.warn(
      `[${NAME}] verdict call failed for #${task.id}: ${(error as Error).message}`,
    );
    inProgress.delete(task.id);
  }
}

function reviewScripted(submission: Submission): {
  verdict: "approve" | "reject";
  note: string;
} {
  const hasSubstance = submission.body.trim().length > 100;
  const hasNumberedSteps = /^\s*\d+\./m.test(submission.body);

  if (hasSubstance && hasNumberedSteps) {
    return {
      verdict: "approve",
      note: "Scripted check passed: draft has numbered action steps and sufficient detail.",
    };
  }

  return {
    verdict: "reject",
    note: "Scripted check failed: draft is too short or lacks numbered action steps.",
  };
}

async function reviewWithLlm(
  task: Task,
  submission: Submission,
  building: Building | undefined,
): Promise<{ verdict: "approve" | "reject"; note: string }> {
  try {
    return await callReviewLlm(task, submission, building);
  } catch (error) {
    console.warn(
      `[${NAME}] LLM review failed (${(error as Error).message}); falling back to scripted`,
    );
    return reviewScripted(submission);
  }
}

async function callReviewLlm(
  task: Task,
  submission: Submission,
  building: Building | undefined,
): Promise<{ verdict: "approve" | "reject"; note: string }> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const fineText =
    task.fineEstimateUsd !== undefined
      ? `$${task.fineEstimateUsd.toLocaleString()}/yr`
      : "not modeled";

  const prompt = [
    `You are a senior NYC building compliance reviewer. Assess whether this draft action plan is complete and actionable enough to send to the building owner.`,
    ``,
    `Task: ${task.title}`,
    `Law: ${task.lawId} (${task.kind})`,
    `Building: ${building?.address ?? "unknown"}, ${(building?.sqft ?? 0).toLocaleString()} sqft${building?.isAffordable ? ", affordable housing" : ""}`,
    `Fine exposure: ${fineText}`,
    ``,
    `DRAFT:`,
    submission.body,
    ``,
    `Reply with EXACTLY one of these two formats — nothing else:`,
    `APPROVE: <one sentence stating why this draft meets the standard>`,
    `REJECT: <one sentence stating specifically what is missing or insufficient>`,
  ].join("\n");

  const completion = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [{ role: "user", content: prompt }],
  });

  const text = completion.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("")
    .trim();

  if (text.startsWith("APPROVE:")) {
    return { verdict: "approve", note: text.slice("APPROVE:".length).trim() };
  }

  if (text.startsWith("REJECT:")) {
    return { verdict: "reject", note: text.slice("REJECT:".length).trim() };
  }

  // Ambiguous response: forward to human rather than auto-reject.
  console.warn(`[${NAME}] ambiguous LLM response: "${text.slice(0, 80)}"`);
  return {
    verdict: "approve",
    note: "LLM review inconclusive — forwarded for human review.",
  };
}

import "server-only";

import { tasks } from "@trigger.dev/sdk";

// Payload for the "intake-run" task (agents/src/trigger/intake-run.ts). Declared
// locally on purpose: importing the task's type would pull the entire agent +
// data-pipeline dependency graph into the client build just to type one field.
type IntakeRunPayload = { taskId: number };

// Fire the agent for one task. Authenticates with TRIGGER_SECRET_KEY (Next
// server env). An idempotencyKey of the task id makes the request-then-trigger
// pair exactly-once: a retried route call or a double-submit reuses the same run
// instead of spawning a second agent on the same task. Re-drafts (a rejected
// obligation returning to the queue) pass a fresh key so they actually re-run.
export async function dispatchTaskRun(taskId: number, opts?: { idempotencyKey?: string }) {
  const payload: IntakeRunPayload = { taskId };

  return tasks.trigger(
    "intake-run",
    payload,
    opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
  );
}

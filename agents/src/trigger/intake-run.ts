// The agent, as a Trigger.dev task. One run works one task: it marks the task
// running, does intake or drafting, writes a submission, and moves the task to
// in_review (or auto-approves an obligation draft). This is worker.ts's runTask
// minus everything Trigger.dev now owns — no WebSocket, no register/claim/
// heartbeat lease, no reaper. Concurrency and retries are the platform's job;
// exactly-one-runner is guaranteed by triggering with idempotencyKey = taskId.
import { task } from "@trigger.dev/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createJobSupabase } from "./supabase.ts";
import { draftInputFrom } from "../draftInput.ts";
import { draftScripted } from "../policies/scripted.ts";
import { draftLlm } from "../policies/llm.ts";
import { prepareIntake } from "../../../data/src/intake.ts";

const MAX_ATTEMPTS = 3;
const USE_LLM = process.env.USE_LLM === "true";

// Short names so the activity feed reads like a roster: ll97-12, intake-3.
const KIND_SHORT: Record<string, string> = {
  building_intake: "intake",
  emissions_fine_analysis: "ll97",
  prescriptive_measures_plan: "art321",
};

type TaskRow = {
  id: number;
  owner: string;
  building_id: number | null;
  law_id: string;
  kind: string;
  title: string;
  status: string;
  deadline: string;
  fine_estimate_usd: number | null;
  intake_address: string | null;
};

export const intakeRun = task({
  id: "intake-run",
  retry: {
    maxAttempts: MAX_ATTEMPTS,
    factor: 1.8,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 30_000,
    randomize: true,
  },
  run: async (payload: { taskId: number }, { ctx }) => {
    const supabase = createJobSupabase();

    const { data: taskRow, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", payload.taskId)
      .single<TaskRow>();

    if (error || !taskRow) {
      throw new Error(`task ${payload.taskId} not found: ${error?.message ?? "no row"}`);
    }

    // A re-triggered run (idempotency miss, manual replay) finds the task
    // already past dispatch. Do nothing rather than double-submit.
    if (["in_review", "approved", "rejected", "done"].includes(taskRow.status)) {
      return { skipped: true, status: taskRow.status };
    }

    await supabase
      .from("tasks")
      .update({ status: "running", trigger_run_id: ctx.run.id })
      .eq("id", taskRow.id);

    // Any throw here bubbles to Trigger.dev, which retries with backoff; the
    // task stays 'running' between attempts. Terminal failure is handled in
    // onFailure, so there is no attempt-counting here.
    if (taskRow.kind === "building_intake") {
      await runIntake(supabase, taskRow);
    } else {
      await runDrafting(supabase, taskRow);
    }
    return { ok: true, taskId: taskRow.id };
  },
  // Fires once, after all retries are exhausted (or after the single attempt
  // when retries are disabled, as in dev). This is what returns a crashed or
  // timed-out run to a terminal state — the counterpart to the old reaper
  // marking a stale worker dead. The status guard leaves a run that already
  // reached a terminal state (rejected, in_review, approved) untouched.
  onFailure: async ({ payload, error }) => {
    const supabase = createJobSupabase();

    const { data: current } = await supabase
      .from("tasks")
      .select("owner, status")
      .eq("id", payload.taskId)
      .maybeSingle();

    if (!current || current.status !== "running") {
      return;
    }

    await supabase
      .from("tasks")
      .update({ status: "failed", trigger_run_id: null })
      .eq("id", payload.taskId);
    await logEvent(
      supabase,
      current.owner,
      "task_failed",
      `run failed: ${(error as Error)?.message ?? "unknown error"}`,
      payload.taskId,
    );
  },
});

// Intake: resolve the address through the data pipeline. A geocode the gate
// refuses is terminal (rejected); any other failure becomes an honest report
// submitted for review — matching the worker, which did not retry intake. Only
// DB/write errors bubble up to Trigger.dev's retry.
async function runIntake(supabase: SupabaseClient, taskRow: TaskRow) {
  const address = taskRow.intake_address;
  if (!address) {
    await failIntake(
      supabase,
      taskRow,
      "Intake task has no address — re-request with a street address.",
    );
    return;
  }

  let intake: Awaited<ReturnType<typeof prepareIntake>>;
  try {
    intake = await prepareIntake(address);
  } catch (err) {
    if ((err as Error).name === "GeocodeRejectionError") {
      await failIntake(supabase, taskRow, (err as Error).message);
      return;
    }

    const report = [
      `BUILDING INTAKE FAILED — ${address}`,
      ``,
      `Reason: ${(err as Error).message}`,
      `No building was ingested. Verify the address (include the borough) and re-request.`,
    ].join("\n");
    await submitDraft(supabase, taskRow, report, null);
    return;
  }

  await submitDraft(supabase, taskRow, intake.summary, intake.ingestArgs);
}

async function runDrafting(supabase: SupabaseClient, taskRow: TaskRow) {
  let building: Record<string, unknown> | null = null;
  if (taskRow.building_id) {
    const { data } = await supabase
      .from("buildings")
      .select("*")
      .eq("id", taskRow.building_id)
      .single();
    building = data;
  }

  const input = draftInputFrom(toTaskLike(taskRow), toBuildingLike(building));
  const body = USE_LLM ? await draftLlm(input) : draftScripted(input);

  await submitDraft(supabase, taskRow, body, null);
}

// The one write path for a finished draft: record the submission, then either
// leave it for a human (manual) or auto-approve an obligation draft (auto).
// Intakes are exempt from auto-approve — creating a building always takes a
// human — exactly as submit_work enforced. payload is the ready-to-ingest args
// for intakes, null otherwise.
async function submitDraft(
  supabase: SupabaseClient,
  taskRow: TaskRow,
  body: string,
  payload: unknown,
) {
  await supabase.from("submissions").insert({
    owner: taskRow.owner,
    task_id: taskRow.id,
    agent_name: agentName(taskRow),
    body,
    payload_json: payload ?? null,
  });

  await logEvent(
    supabase,
    taskRow.owner,
    "work_submitted",
    `${agentName(taskRow)} submitted a draft for review`,
    taskRow.id,
  );

  const autoApprove =
    taskRow.kind !== "building_intake" &&
    (await reviewMode(supabase, taskRow.owner)) === "auto";

  if (!autoApprove) {
    await supabase.from("tasks").update({ status: "in_review" }).eq("id", taskRow.id);
    return;
  }

  await supabase.from("approvals").insert({
    owner: taskRow.owner,
    task_id: taskRow.id,
    approved_by: taskRow.owner,
    verdict: "approved",
    note: "auto-approved — review mode is auto",
  });
  await supabase.from("tasks").update({ status: "approved" }).eq("id", taskRow.id);
  await logEvent(
    supabase,
    taskRow.owner,
    "task_approved",
    "auto-approved — review mode is auto",
    taskRow.id,
  );
}

async function failIntake(supabase: SupabaseClient, taskRow: TaskRow, reason: string) {
  await supabase.from("submissions").insert({
    owner: taskRow.owner,
    task_id: taskRow.id,
    agent_name: agentName(taskRow),
    body: reason,
    payload_json: null,
  });
  await supabase.from("tasks").update({ status: "rejected" }).eq("id", taskRow.id);
  await logEvent(supabase, taskRow.owner, "intake_failed", reason, taskRow.id);
}

async function reviewMode(supabase: SupabaseClient, owner: string): Promise<string> {
  const { data } = await supabase
    .from("settings")
    .select("review_mode")
    .eq("owner", owner)
    .maybeSingle();
  return data?.review_mode ?? "manual";
}

async function logEvent(
  supabase: SupabaseClient,
  owner: string,
  kind: string,
  payload: string,
  taskId: number,
) {
  await supabase.rpc("log_event", {
    p_owner: owner,
    p_kind: kind,
    p_payload: payload,
    p_task_id: taskId,
  });
}

function agentName(taskRow: TaskRow): string {
  return `${KIND_SHORT[taskRow.kind] ?? taskRow.kind}-${taskRow.id}`;
}

function toTaskLike(taskRow: TaskRow) {
  return {
    title: taskRow.title,
    kind: taskRow.kind,
    lawId: taskRow.law_id,
    fineEstimateUsd: taskRow.fine_estimate_usd ?? undefined,
    deadline: taskRow.deadline ? { toDate: () => new Date(taskRow.deadline) } : undefined,
  };
}

// Adapt a Supabase building row (snake_case, jsonb columns) to the BuildingLike
// shape draftInputFrom expects (camelCase, JSON-string columns). The stringify
// round-trip is intentional: draftInputFrom re-parses and tolerates corruption.
function toBuildingLike(building: Record<string, unknown> | null) {
  if (!building) {
    return undefined;
  }

  return {
    address: String(building.address ?? "unknown"),
    bbl: (building.bbl as string | null) ?? undefined,
    sqft: Number(building.sqft ?? 0),
    isAffordable: Boolean(building.is_affordable),
    annualEmissionsTco2E: (building.annual_emissions_tco2e as number | null) ?? undefined,
    usesJson: building.uses_json ? JSON.stringify(building.uses_json) : undefined,
    ll97Covered: (building.ll97_covered as boolean | null) ?? undefined,
    provenanceJson: building.provenance_json
      ? JSON.stringify(building.provenance_json)
      : undefined,
    systemsJson: building.systems_json ? JSON.stringify(building.systems_json) : undefined,
    compliancePlanJson: building.compliance_plan_json
      ? JSON.stringify(building.compliance_plan_json)
      : undefined,
  };
}

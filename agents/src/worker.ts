// Every task gets its own agent. This process is a dispatcher: it watches the
// open queue and registers one fresh worker row per task, so the fleet page
// shows exactly who is working on what. A task agent registers, claims its one
// task, works it, submits, and stops heartbeating — the reaper sweeps its row
// to dead afterwards.
//
// The queue is polled over HTTP (no long-lived socket to babysit): a failed
// sweep is logged and the next one runs 2 seconds later, which replaces the
// old reconnect machinery outright.
import { loadEnvLocal } from "../../data/src/loadEnv.ts";
import { fleetClient, callRpc, type TaskRow, type BuildingRow } from "./supabase.ts";

loadEnvLocal();
import { draftInputFrom } from "./draftInput.ts";
import { draftScripted } from "./policies/scripted.ts";
import { draftLlm } from "./policies/llm.ts";

const USE_LLM = process.env.USE_LLM === "true";
const MAX_CONCURRENT = Number(process.env.AGENT_CONCURRENCY ?? 4);
const WORK_MS = 6_000; // simulated drafting time so the demo is watchable
const SWEEP_MS = 2_000;
const HEARTBEAT_MS = 5_000;

// Optional filter: "emissions_fine_analysis,benchmarking_filing" means this
// dispatcher only picks up tasks of those kinds. Unset = accept everything.
const KINDS: string[] | null = process.env.WORKER_KINDS
  ? process.env.WORKER_KINDS.split(",").map(s => s.trim())
  : null;

// Short names so the fleet reads like a roster: ll97-12, intake-3.
const KIND_SHORT: Record<string, string> = {
  building_intake: "intake",
  emissions_fine_analysis: "ll97",
  prescriptive_measures_plan: "art321",
  benchmarking_filing: "ll84",
  audit_filing: "ll87",
  facade_inspection: "ll11",
  lighting_submetering_plan: "ll88",
  energy_grade_posting: "ll33",
  gas_piping_certification: "ll152",
  mold_pest_remediation: "ll55",
};

const DISPATCHER_NAME = process.env.WORKER_NAME ?? "dispatcher";

let db: ReturnType<typeof fleetClient>;
const inFlight = new Set<number>();
let sweeping = false;

async function main() {
  let dispatcherId: number;
  try {
    db = fleetClient();
    dispatcherId = await callRpc<number>(db, "register_worker", {
      p_name: DISPATCHER_NAME,
    });
  } catch (error) {
    console.error(`[dispatcher] connection failed:`, (error as Error).message);
    process.exit(1);
  }

  console.log(`[dispatcher] watching the queue as worker #${dispatcherId}`);

  setInterval(() => {
    callRpc(db, "heartbeat", { p_worker_id: dispatcherId }).catch(() => {});
  }, HEARTBEAT_MS);

  await sweep();
  setInterval(() => void sweep(), SWEEP_MS);
}

async function sweep() {
  // A slow query must not let the next interval tick double-dispatch the
  // same open task; one sweep at a time.
  if (sweeping || inFlight.size >= MAX_CONCURRENT) {
    return;
  }
  sweeping = true;
  try {
    await runSweep();
  } finally {
    sweeping = false;
  }
}

async function runSweep() {
  let query = db
    .from("task")
    .select("*")
    .eq("status", "open")
    .order("id", { ascending: true })
    .limit(MAX_CONCURRENT * 2);
  if (KINDS !== null) {
    query = query.in("kind", KINDS);
  }

  const { data, error } = await query;
  if (error) {
    console.warn(`[dispatcher] sweep failed: ${error.message}`);
    return;
  }

  const openTasks = (data as TaskRow[]).filter(task => !inFlight.has(task.id));
  for (const task of openTasks.slice(0, MAX_CONCURRENT - inFlight.size)) {
    inFlight.add(task.id);
    runAgentFor(task).finally(() => inFlight.delete(task.id));
  }
}

// One agent, one task, one worker row. Every dispatch registers a fresh row
// on purpose: that is what makes the fleet page a roster.
async function runAgentFor(task: TaskRow) {
  const name = `${KIND_SHORT[task.kind] ?? task.kind}-${task.id}`;

  let workerId: number;
  try {
    workerId = await callRpc<number>(db, "register_worker", { p_name: name });
  } catch (error) {
    console.error(`[${name}] could not register; will retry on a later sweep`);
    return;
  }

  try {
    await callRpc(db, "claim_task", { p_worker_id: workerId, p_task_id: task.id });
  } catch {
    // Another agent won the race — the function rejected us. That's the point.
    return;
  }

  console.log(`[${name}] claimed #${task.id}`);
  const heartbeat = setInterval(() => {
    callRpc(db, "heartbeat", { p_worker_id: workerId }).catch(() => {});
  }, HEARTBEAT_MS);

  try {
    const result =
      task.kind === "building_intake"
        ? await intakeBuilding(name, task)
        : { body: await draftFor(name, task), payloadJson: undefined };

    if ("failed" in result) {
      await callRpc(db, "fail_intake", {
        p_worker_id: workerId,
        p_task_id: task.id,
        p_reason: result.failed,
      });
      console.log(`[${name}] intake rejected: ${result.failed}`);
      return;
    }

    await callRpc(db, "submit_work", {
      p_worker_id: workerId,
      p_task_id: task.id,
      p_body: result.body,
      p_payload_json: result.payloadJson ?? null,
    });
    console.log(`[${name}] submitted #${task.id} for review`);
  } catch (error) {
    // Task was likely reaped away from us (e.g. we were killed mid-work).
    console.warn(`[${name}] failed on #${task.id}: ${(error as Error).message}`);
  } finally {
    clearInterval(heartbeat);
  }
}

async function draftFor(name: string, task: TaskRow) {
  let building: BuildingRow | undefined;
  if (task.building_id !== null) {
    const { data } = await db
      .from("building")
      .select("*")
      .eq("id", task.building_id)
      .maybeSingle();
    building = (data as BuildingRow) ?? undefined;
  }

  console.log(`[${name}] drafting for #${task.id}…`);
  await new Promise(resolve => setTimeout(resolve, WORK_MS));

  const input = draftInputFrom(task, building);
  return USE_LLM ? await draftLlm(input) : draftScripted(input);
}

// Intake: resolve the address through the data pipeline and submit the
// report for review with the ready-to-ingest payload attached — the building
// is only created when a human approves. A geocode the gate refuses
// auto-rejects the task; any other failure becomes an honest report.
type IntakeOutcome =
  { body: string; payloadJson: string | undefined } | { failed: string };

async function intakeBuilding(name: string, task: TaskRow): Promise<IntakeOutcome> {
  const address = task.intake_address;
  if (!address) {
    return { failed: "Intake task has no address — re-request with a street address." };
  }

  console.log(`[${name}] intake for #${task.id}: ${address}`);

  try {
    const { prepareIntake } = await import("../../data/src/intake.ts");
    const { toIngestPayload } = await import("../../data/src/ingestPayload.ts");
    const intake = await prepareIntake(address);

    return {
      body: intake.summary,
      payloadJson: JSON.stringify(toIngestPayload(intake.ingestArgs)),
    };
  } catch (error) {
    if ((error as Error).name === "GeocodeRejectionError") {
      return { failed: (error as Error).message };
    }

    return {
      body: [
        `BUILDING INTAKE FAILED — ${address}`,
        ``,
        `Reason: ${(error as Error).message}`,
        `No building was ingested. Verify the address (include the borough) and re-request.`,
      ].join("\n"),
      payloadJson: undefined,
    };
  }
}

void main();

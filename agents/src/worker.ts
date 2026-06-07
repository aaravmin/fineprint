// Agent worker: subscribe → claim → work → submit. One worker per process.
// Run several in separate terminals: npm run worker
import { DbConnection } from "./module_bindings/index.ts";
import { draftInputFrom } from "./draftInput.ts";
import { draftScripted } from "./policies/scripted.ts";
import { draftLlm } from "./policies/llm.ts";

const HOST = process.env.SPACETIME_URI ?? "ws://localhost:3011";
const DB_NAME = process.env.DB_NAME ?? "fineprint";
const USE_LLM = process.env.USE_LLM === "true";
const NAME = process.env.WORKER_NAME ?? `agent-${process.pid}`;
const WORK_MS = 6_000; // simulated drafting time so the demo is watchable

// Optional filter: "emissions_fine_analysis,benchmarking_filing" means this
// worker only picks up tasks of those kinds. Unset = accept everything.
const KINDS: Set<string> | null = process.env.WORKER_KINDS
  ? new Set(process.env.WORKER_KINDS.split(",").map(s => s.trim()))
  : null;

let myIdentityHex = "";
let busy = false;

const conn = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  // No token on purpose: every worker process gets a fresh identity.
  .onConnect((conn, identity) => {
    myIdentityHex = identity.toHexString();
    console.log(`[${NAME}] connected as ${myIdentityHex.slice(0, 8)}…`);

    conn
      .subscriptionBuilder()
      .onApplied(async () => {
        await conn.reducers.registerWorker({ name: NAME });
        setInterval(() => void tick(), 2_000);
        setInterval(() => conn.reducers.heartbeat({}).catch(() => {}), 5_000);
      })
      .subscribeToAllTables();
  })
  .onConnectError((_ctx, error) => {
    console.error(`[${NAME}] connection failed:`, error.message);
    process.exit(1);
  })
  .build();

function me() {
  return [...conn.db.worker.iter()].find(
    worker => worker.identity.toHexString() === myIdentityHex,
  );
}

async function tick() {
  const self = me();
  if (!self) return;

  if (self.status === "dead") {
    console.log(`[${NAME}] marked dead by the system. Exiting.`);
    process.exit(1);
  }
  if (busy) return;

  if (self.status === "working" && self.currentTaskId !== undefined) {
    busy = true;
    await workOn(self.currentTaskId).finally(() => (busy = false));
    return;
  }

  if (self.status === "idle") {
    const nextOpenTask = [...conn.db.task.iter()]
      .filter(task => task.status === "open")
      .filter(task => KINDS === null || KINDS.has(task.kind))
      .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    if (!nextOpenTask) return;

    try {
      await conn.reducers.claimTask({ taskId: nextOpenTask.id });
      console.log(`[${NAME}] claimed #${nextOpenTask.id}: ${nextOpenTask.title}`);
    } catch {
      // Another worker won the race — the reducer rejected us. That's the point.
    }
  }
}

async function workOn(taskId: bigint) {
  const task = [...conn.db.task.iter()].find(row => row.id === taskId);
  if (!task) return;

  const body =
    task.kind === "building_intake" ? await intakeBuilding(task) : await draftFor(task);

  try {
    await conn.reducers.submitWork({ taskId, body });
    console.log(`[${NAME}] submitted #${taskId} for review`);
  } catch (error) {
    // Task was likely reaped away from us (e.g. we were killed mid-work).
    console.warn(`[${NAME}] submit failed for #${taskId}: ${(error as Error).message}`);
  }
}

async function draftFor(
  task: { id: bigint; buildingId: bigint } & Parameters<typeof draftInputFrom>[0],
) {
  const building = [...conn.db.building.iter()].find(row => row.id === task.buildingId);

  console.log(`[${NAME}] drafting for #${task.id}…`);
  await new Promise(resolve => setTimeout(resolve, WORK_MS));

  const input = draftInputFrom(task, building);
  return USE_LLM ? await draftLlm(input) : draftScripted(input);
}

// Intake: resolve the address through the data pipeline, ingest the building
// (which spawns its real obligations), and submit the intake report for
// review. A failed lookup becomes an honest report, not a stuck task.
async function intakeBuilding(task: {
  id: bigint;
  intakeAddress?: string;
}): Promise<string> {
  const address = task.intakeAddress;
  if (!address) {
    return "Intake task has no address — flagging for manual triage.";
  }

  console.log(`[${NAME}] intake for #${task.id}: ${address}`);

  try {
    const { prepareIntake } = await import("../../data/src/intake.ts");
    const intake = await prepareIntake(address);

    await conn.reducers.ingestBuilding(intake.ingestArgs);
    return intake.summary;
  } catch (error) {
    return [
      `BUILDING INTAKE FAILED — ${address}`,
      ``,
      `Reason: ${(error as Error).message}`,
      `No building was ingested. Verify the address (include the borough) and re-request.`,
    ].join("\n");
  }
}

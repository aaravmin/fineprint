// Agent worker: subscribe → claim → work → submit. One worker per process.
// Run several in separate terminals: npm run worker
import { DbConnection } from "./module_bindings/index.ts";
import { draftScripted } from "./policies/scripted.ts";
import { draftLlm } from "./policies/llm.ts";
import type { DraftInput } from "./policies/types.ts";

const HOST = process.env.SPACETIME_URI ?? "ws://localhost:3000";
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
  const building = [...conn.db.building.iter()].find(row => row.id === task.buildingId);

  console.log(`[${NAME}] drafting for #${taskId}…`);
  await new Promise(resolve => setTimeout(resolve, WORK_MS));

  const input: DraftInput = {
    title: task.title,
    kind: task.kind,
    lawId: task.lawId,
    address: building?.address ?? "unknown",
    sqft: building?.sqft ?? 0,
    isAffordable: building?.isAffordable ?? false,
    fineEstimateUsd: task.fineEstimateUsd,
    annualEmissionsTco2e: building?.annualEmissionsTco2E ?? undefined,
    usesJson: building?.usesJson ?? undefined,
    provenanceJson: building?.provenanceJson ?? undefined,
  };
  const body = USE_LLM ? await draftLlm(input) : draftScripted(input);

  try {
    await conn.reducers.submitWork({ taskId, body });
    console.log(`[${NAME}] submitted #${taskId} for review`);
  } catch (error) {
    // Task was likely reaped away from us (e.g. we were killed mid-work).
    console.warn(`[${NAME}] submit failed for #${taskId}: ${(error as Error).message}`);
  }
}

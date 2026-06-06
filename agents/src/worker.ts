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
  .onConnectError((_ctx, err) => {
    console.error(`[${NAME}] connection failed:`, err.message);
    process.exit(1);
  })
  .build();

function me() {
  return [...conn.db.worker.iter()].find(
    (w) => w.identity.toHexString() === myIdentityHex,
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
    const open = [...conn.db.task.iter()]
      .filter((t) => t.status === "open")
      .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    if (!open) return;
    try {
      await conn.reducers.claimTask({ taskId: open.id });
      console.log(`[${NAME}] claimed #${open.id}: ${open.title}`);
    } catch {
      // Another worker won the race — the reducer rejected us. That's the point.
    }
  }
}

async function workOn(taskId: bigint) {
  const task = [...conn.db.task.iter()].find((t) => t.id === taskId);
  if (!task) return;
  const building = [...conn.db.building.iter()].find(
    (b) => b.id === task.buildingId,
  );

  console.log(`[${NAME}] drafting for #${taskId}…`);
  await new Promise((r) => setTimeout(r, WORK_MS));

  const input: DraftInput = {
    title: task.title,
    kind: task.kind,
    lawId: task.lawId,
    address: building?.address ?? "unknown",
    sqft: building?.sqft ?? 0,
    isAffordable: building?.isAffordable ?? false,
    fineEstimateUsd: task.fineEstimateUsd,
  };
  const body = USE_LLM ? await draftLlm(input) : draftScripted(input);

  try {
    await conn.reducers.submitWork({ taskId, body });
    console.log(`[${NAME}] submitted #${taskId} for review`);
  } catch (err) {
    // Task was likely reaped away from us (e.g. we were killed mid-work).
    console.warn(
      `[${NAME}] submit failed for #${taskId}: ${(err as Error).message}`,
    );
  }
}

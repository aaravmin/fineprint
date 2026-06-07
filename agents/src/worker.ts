// Every task gets its own agent. This process is a dispatcher: an anonymous
// observer connection watches the open queue and spawns one fresh
// connection-plus-identity per task, so the fleet page shows exactly who is
// working on what. A task agent registers, claims its one task, works it,
// submits, and disconnects — the reaper sweeps its row to dead afterwards.
import { DbConnection } from "./module_bindings/index.ts";
import { draftInputFrom } from "./draftInput.ts";
import { draftScripted } from "./policies/scripted.ts";
import { draftLlm } from "./policies/llm.ts";

const HOST = process.env.SPACETIME_URI ?? "ws://localhost:3011";
const DB_NAME = process.env.DB_NAME ?? "fineprint";
const USE_LLM = process.env.USE_LLM === "true";
const MAX_CONCURRENT = Number(process.env.AGENT_CONCURRENCY ?? 4);
const WORK_MS = 6_000; // simulated drafting time so the demo is watchable

// Optional filter: "emissions_fine_analysis,benchmarking_filing" means this
// dispatcher only picks up tasks of those kinds. Unset = accept everything.
const KINDS: Set<string> | null = process.env.WORKER_KINDS
  ? new Set(process.env.WORKER_KINDS.split(",").map(s => s.trim()))
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
  gas_piping_certification: "ll152",
  mold_pest_remediation: "ll55",
};

const inFlight = new Set<string>();

const DISPATCHER_NAME = process.env.WORKER_NAME ?? "dispatcher";

const observer = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .onConnect((conn, identity) => {
    console.log(
      `[dispatcher] watching the queue as ${identity.toHexString().slice(0, 8)}…`,
    );

    conn
      .subscriptionBuilder()
      .onApplied(async () => {
        // Register and heartbeat so the dashboard knows agents are on call
        // even while the queue is empty — otherwise the "no agents online"
        // banner shows between tasks.
        await conn.reducers.registerWorker({ name: DISPATCHER_NAME });
        setInterval(() => conn.reducers.heartbeat({}).catch(() => {}), 5_000);
        setInterval(() => dispatch(), 2_000);
      })
      .subscribeToAllTables();
  })
  .onConnectError((_ctx, error) => {
    console.error(`[dispatcher] connection failed:`, error.message);
    process.exit(1);
  })
  .build();

function dispatch() {
  if (inFlight.size >= MAX_CONCURRENT) return;

  const openTasks = [...observer.db.task.iter()]
    .filter(task => task.status === "open")
    .filter(task => KINDS === null || KINDS.has(task.kind))
    .filter(task => !inFlight.has(String(task.id)))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  for (const task of openTasks.slice(0, MAX_CONCURRENT - inFlight.size)) {
    inFlight.add(String(task.id));
    spawnAgentFor(task.id, task.kind).finally(() => inFlight.delete(String(task.id)));
  }
}

// One agent, one task, one identity. No token on purpose: every spawn is a
// fresh worker row, which is the whole point.
async function spawnAgentFor(taskId: bigint, kind: string) {
  const name = `${KIND_SHORT[kind] ?? kind}-${taskId}`;

  await new Promise<void>(resolve => {
    const conn = DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB_NAME)
      .onConnect((agentConn, _identity) => {
        agentConn
          .subscriptionBuilder()
          .onApplied(() => {
            void runTask(agentConn, name, taskId).finally(() => {
              agentConn.disconnect();
              resolve();
            });
          })
          .subscribeToAllTables();
      })
      .onConnectError(() => {
        console.error(`[${name}] could not connect; will retry on a later sweep`);
        resolve();
      })
      .build();
    void conn;
  });
}

async function runTask(conn: DbConnection, name: string, taskId: bigint) {
  try {
    await conn.reducers.registerWorker({ name });
    await conn.reducers.claimTask({ taskId });
  } catch {
    // Another agent won the race — the reducer rejected us. That's the point.
    return;
  }

  console.log(`[${name}] claimed #${taskId}`);
  const heartbeat = setInterval(() => conn.reducers.heartbeat({}).catch(() => {}), 5_000);

  try {
    const task = [...conn.db.task.iter()].find(row => row.id === taskId);
    if (!task) return;

    const result =
      task.kind === "building_intake"
        ? await intakeBuilding(name, task)
        : { body: await draftFor(conn, name, task), payloadJson: undefined };

    if ("failed" in result) {
      await conn.reducers.failIntake({ taskId, reason: result.failed });
      console.log(`[${name}] intake rejected: ${result.failed}`);
      return;
    }

    await conn.reducers.submitWork({
      taskId,
      body: result.body,
      payloadJson: result.payloadJson,
    });
    console.log(`[${name}] submitted #${taskId} for review`);
  } catch (error) {
    // Task was likely reaped away from us (e.g. we were killed mid-work).
    console.warn(`[${name}] failed on #${taskId}: ${(error as Error).message}`);
  } finally {
    clearInterval(heartbeat);
  }
}

async function draftFor(
  conn: DbConnection,
  name: string,
  task: { id: bigint; buildingId: bigint } & Parameters<typeof draftInputFrom>[0],
) {
  const building = [...conn.db.building.iter()].find(row => row.id === task.buildingId);

  console.log(`[${name}] drafting for #${task.id}…`);
  await new Promise(resolve => setTimeout(resolve, WORK_MS));

  const input = draftInputFrom(task, building);
  return USE_LLM ? await draftLlm(input) : draftScripted(input);
}

// Intake: resolve the address through the data pipeline and submit the
// report for review with the ready-to-ingest args attached — the building
// is only created when a human approves. A geocode the gate refuses
// auto-rejects the task; any other failure becomes an honest report.
type IntakeOutcome =
  | { body: string; payloadJson: string | undefined }
  | { failed: string };

async function intakeBuilding(
  name: string,
  task: { id: bigint; intakeAddress?: string },
): Promise<IntakeOutcome> {
  const address = task.intakeAddress;
  if (!address) {
    return { failed: "Intake task has no address — re-request with a street address." };
  }

  console.log(`[${name}] intake for #${task.id}: ${address}`);

  try {
    const { prepareIntake } = await import("../../data/src/intake.ts");
    const intake = await prepareIntake(address);

    return {
      body: intake.summary,
      payloadJson: JSON.stringify(intake.ingestArgs),
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

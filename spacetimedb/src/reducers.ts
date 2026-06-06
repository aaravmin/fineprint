import { ScheduleAt, Timestamp } from "spacetimedb";
import { t } from "spacetimedb/server";
import spacetimedb, { reaperTick } from "./schema";
import { applicableLaws, LAWS } from "./laws";

const HEARTBEAT_STALE_MS = 15_000; // 3 missed 5s heartbeats = dead
const REAP_INTERVAL_MICROS = 5_000_000n; // 5s

// Every reducer writes one event row — no silent mutations.
function logEvent(
  ctx: any,
  kind: string,
  payload: string,
  taskId?: bigint,
  workerId?: bigint,
) {
  ctx.db.event.insert({
    id: 0n,
    kind,
    taskId,
    workerId,
    payload,
    at: ctx.timestamp,
  });
}

function addMs(now: Timestamp, ms: number): Timestamp {
  return Timestamp.fromDate(new Date(now.toDate().getTime() + ms));
}

function workerBySender(ctx: any) {
  return ctx.db.worker.identity.find(ctx.sender);
}

export const init = spacetimedb.init(ctx => {
  // Initial publish only: arm the reaper tick.
  ctx.db.reaperTick.insert({
    id: 0n,
    scheduledAt: ScheduleAt.interval(REAP_INTERVAL_MICROS),
  });
  logEvent(ctx, "system", "module initialized; reaper armed (5s)");
});

export const add_building = spacetimedb.reducer(
  { address: t.string(), sqft: t.u32(), isAffordable: t.bool() },
  (ctx, { address, sqft, isAffordable }) => {
    if (address.trim() === "") throw new Error("address cannot be empty");
    if (sqft === 0) throw new Error("sqft must be positive");

    const newBuilding = ctx.db.building.insert({
      id: 0n,
      address,
      bbl: undefined,
      sqft,
      isAffordable,
      annualEmissionsTco2e: undefined,
      usesJson: undefined,
      ll97Covered: undefined,
      provenanceJson: undefined,
      createdAt: ctx.timestamp,
    });

    const laws = applicableLaws(sqft, isAffordable);
    for (const law of laws) {
      const fine = law.fineEstimateUsd(sqft, isAffordable);
      ctx.db.task.insert({
        id: 0n,
        buildingId: newBuilding.id,
        lawId: law.id,
        kind: law.kind,
        title: `${law.name} — ${address}`,
        status: "open",
        deadline: addMs(ctx.timestamp, law.deadlineDays * 86_400_000),
        slaBreached: false,
        fineEstimateUsd: fine === null ? undefined : fine,
        claimedBy: undefined,
        createdAt: ctx.timestamp,
      });
    }

    logEvent(
      ctx,
      "building_added",
      `${address} (${sqft} sqft${isAffordable ? ", affordable" : ""}) → ${laws.length} obligations spawned`,
    );
  },
);

// Real-data intake: scripts/ingest.ts resolves an address through the data
// package (GeoSearch -> LL84 -> covered buildings list) and calls this with
// the assembled facts. Obligations spawn from DOB's covered-list flags when
// provided; the sqft heuristic is only the fallback for unknown buildings.
export const ingest_building = spacetimedb.reducer(
  {
    address: t.string(),
    bbl: t.string(),
    sqft: t.u32(),
    isArticle321: t.bool(),
    annualEmissionsTco2e: t.option(t.f64()),
    usesJson: t.string(),
    coveredLawIdsJson: t.string(),
    provenanceJson: t.string(),
  },
  (ctx, args) => {
    if (args.address.trim() === "") throw new Error("address cannot be empty");
    if (args.bbl.trim() === "") throw new Error("bbl cannot be empty");

    const existingBuilding = [...ctx.db.building.iter()].find(
      row => row.bbl === args.bbl,
    );

    if (existingBuilding) {
      ctx.db.building.id.update({
        ...existingBuilding,
        address: args.address,
        sqft: args.sqft,
        isAffordable: args.isArticle321,
        annualEmissionsTco2e: args.annualEmissionsTco2e,
        usesJson: args.usesJson,
        ll97Covered: deriveLl97Covered(args.coveredLawIdsJson),
        provenanceJson: args.provenanceJson,
      });

      logEvent(
        ctx,
        "building_updated",
        `${args.address} (BBL ${args.bbl}) refreshed from city data`,
      );
      return;
    }

    const newBuilding = ctx.db.building.insert({
      id: 0n,
      address: args.address,
      bbl: args.bbl,
      sqft: args.sqft,
      isAffordable: args.isArticle321,
      annualEmissionsTco2e: args.annualEmissionsTco2e,
      usesJson: args.usesJson,
      ll97Covered: deriveLl97Covered(args.coveredLawIdsJson),
      provenanceJson: args.provenanceJson,
      createdAt: ctx.timestamp,
    });

    const coveredLawIds: string[] = JSON.parse(args.coveredLawIdsJson);
    const laws =
      coveredLawIds.length > 0
        ? LAWS.filter(law => coveredLawIds.includes(law.id))
        : applicableLaws(args.sqft, args.isArticle321);

    for (const law of laws) {
      const fine = law.fineEstimateUsd(args.sqft, args.isArticle321);
      ctx.db.task.insert({
        id: 0n,
        buildingId: newBuilding.id,
        lawId: law.id,
        kind: law.kind,
        title: `${law.name} — ${args.address}`,
        status: "open",
        deadline: addMs(ctx.timestamp, law.deadlineDays * 86_400_000),
        slaBreached: false,
        fineEstimateUsd: fine === null ? undefined : fine,
        claimedBy: undefined,
        createdAt: ctx.timestamp,
      });
    }

    logEvent(
      ctx,
      "building_ingested",
      `${args.address} (BBL ${args.bbl}) ingested from city data → ${laws.length} obligations spawned`,
    );
  },
);

function deriveLl97Covered(coveredLawIdsJson: string): boolean | undefined {
  const coveredLawIds: string[] = JSON.parse(coveredLawIdsJson);
  if (coveredLawIds.length === 0) {
    return undefined;
  }

  return coveredLawIds.includes("ll97") || coveredLawIds.includes("art321");
}

export const register_worker = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    if (name.trim() === "") throw new Error("worker name cannot be empty");

    const existing = workerBySender(ctx);
    if (existing) {
      // Same identity reconnecting: revive it.
      ctx.db.worker.id.update({
        ...existing,
        name,
        status: "idle",
        lastHeartbeat: ctx.timestamp,
        currentTaskId: undefined,
      });
      logEvent(ctx, "worker_registered", `${name} re-registered`, undefined, existing.id);
      return;
    }

    const newWorker = ctx.db.worker.insert({
      id: 0n,
      identity: ctx.sender,
      name,
      status: "idle",
      lastHeartbeat: ctx.timestamp,
      currentTaskId: undefined,
    });
    logEvent(
      ctx,
      "worker_registered",
      `${name} joined the fleet`,
      undefined,
      newWorker.id,
    );
  },
);

export const heartbeat = spacetimedb.reducer(ctx => {
  const reportingWorker = workerBySender(ctx);
  if (!reportingWorker) throw new Error("heartbeat came from an unregistered worker");
  if (reportingWorker.status === "dead") return; // killed workers stay dead; process should exit

  ctx.db.worker.id.update({ ...reportingWorker, lastHeartbeat: ctx.timestamp });
  logEvent(ctx, "heartbeat", reportingWorker.name, undefined, reportingWorker.id);
});

// THE critical reducer: exactly one owner per task.
// Reducer transactionality makes the check-then-set atomic — two workers
// racing on the same task means one commits, the other's transaction fails.
export const claim_task = spacetimedb.reducer({ taskId: t.u64() }, (ctx, { taskId }) => {
  const claimingWorker = workerBySender(ctx);
  const requestedTask = ctx.db.task.id.find(taskId);

  if (!claimingWorker) {
    throw new Error("claim came from an unregistered worker");
  }
  if (claimingWorker.status !== "idle") {
    throw new Error(`${claimingWorker.name} is already working on something`);
  }

  if (!requestedTask) {
    throw new Error(`no task with id ${taskId}`);
  }
  if (requestedTask.status !== "open") {
    throw new Error(`task ${taskId} was already claimed`);
  }

  ctx.db.task.id.update({
    ...requestedTask,
    status: "claimed",
    claimedBy: claimingWorker.id,
  });

  ctx.db.worker.id.update({
    ...claimingWorker,
    status: "working",
    currentTaskId: taskId,
    lastHeartbeat: ctx.timestamp,
  });

  logEvent(
    ctx,
    "task_claimed",
    `${claimingWorker.name} claimed "${requestedTask.title}"`,
    taskId,
    claimingWorker.id,
  );
});

export const submit_work = spacetimedb.reducer(
  { taskId: t.u64(), body: t.string() },
  (ctx, { taskId, body }) => {
    const submittingWorker = workerBySender(ctx);
    if (!submittingWorker) {
      throw new Error("submission came from an unregistered worker");
    }

    const task = ctx.db.task.id.find(taskId);
    if (!task) {
      throw new Error(`no task with id ${taskId}`);
    }
    if (task.status !== "claimed" || task.claimedBy !== submittingWorker.id) {
      throw new Error(`task ${taskId} is not claimed by ${submittingWorker.name}`);
    }
    if (body.trim() === "") throw new Error("submission body cannot be empty");

    ctx.db.submission.insert({
      id: 0n,
      taskId,
      workerId: submittingWorker.id,
      body,
      submittedAt: ctx.timestamp,
    });
    ctx.db.task.id.update({ ...task, status: "in_review" });
    ctx.db.worker.id.update({
      ...submittingWorker,
      status: "idle",
      currentTaskId: undefined,
      lastHeartbeat: ctx.timestamp,
    });

    logEvent(
      ctx,
      "work_submitted",
      `${submittingWorker.name} submitted a draft for review`,
      taskId,
      submittingWorker.id,
    );
  },
);

export const approve = spacetimedb.reducer(
  { taskId: t.u64(), note: t.string() },
  (ctx, { taskId, note }) => {
    const task = ctx.db.task.id.find(taskId);
    if (!task) throw new Error(`task ${taskId} not found`);
    if (task.status !== "in_review") throw new Error(`task ${taskId} is not in review`);

    ctx.db.approval.insert({
      id: 0n,
      taskId,
      approvedBy: ctx.sender,
      verdict: "approved",
      note,
      at: ctx.timestamp,
    });
    ctx.db.task.id.update({
      ...task,
      status: "approved",
      claimedBy: undefined,
    });
    logEvent(ctx, "task_approved", note || "approved", taskId);
  },
);

export const reject = spacetimedb.reducer(
  { taskId: t.u64(), note: t.string() },
  (ctx, { taskId, note }) => {
    const task = ctx.db.task.id.find(taskId);
    if (!task) throw new Error(`task ${taskId} not found`);
    if (task.status !== "in_review") throw new Error(`task ${taskId} is not in review`);

    ctx.db.approval.insert({
      id: 0n,
      taskId,
      approvedBy: ctx.sender,
      verdict: "rejected",
      note,
      at: ctx.timestamp,
    });
    // Back to the queue for another worker.
    ctx.db.task.id.update({ ...task, status: "open", claimedBy: undefined });
    logEvent(ctx, "task_rejected", note || "rejected — returned to queue", taskId);
  },
);

// Demo button: simulate a crash. The worker process exits when it sees itself dead.
export const kill_worker = spacetimedb.reducer(
  { workerId: t.u64() },
  (ctx, { workerId }) => {
    const targetWorker = ctx.db.worker.id.find(workerId);
    if (!targetWorker) {
      throw new Error(`no worker with id ${workerId}`);
    }
    if (targetWorker.status === "dead") return;

    releaseWorker(ctx, targetWorker, "killed");
    logEvent(
      ctx,
      "worker_killed",
      `${targetWorker.name} was killed`,
      targetWorker.currentTaskId,
      targetWorker.id,
    );
  },
);

function releaseWorker(ctx: any, worker: any, reason: string) {
  if (worker.currentTaskId !== undefined) {
    const abandonedTask = ctx.db.task.id.find(worker.currentTaskId);

    if (
      abandonedTask &&
      abandonedTask.status === "claimed" &&
      abandonedTask.claimedBy === worker.id
    ) {
      ctx.db.task.id.update({ ...abandonedTask, status: "open", claimedBy: undefined });
      logEvent(
        ctx,
        "task_released",
        `"${abandonedTask.title}" returned to open (${reason})`,
        abandonedTask.id,
        worker.id,
      );
    }
  }

  ctx.db.worker.id.update({ ...worker, status: "dead", currentTaskId: undefined });
}

// Scheduled every 5s: crash recovery + SLA breach flagging.
export const reap = spacetimedb.reducer({ arg: reaperTick.rowType }, (ctx, _args) => {
  const nowMs = ctx.timestamp.toDate().getTime();

  for (const worker of ctx.db.worker.iter()) {
    if (worker.status === "dead") continue;

    const silenceMs = nowMs - worker.lastHeartbeat.toDate().getTime();
    if (silenceMs > HEARTBEAT_STALE_MS) {
      releaseWorker(ctx, worker, "heartbeat stale — presumed crashed");
      logEvent(
        ctx,
        "worker_reaped",
        `${worker.name} reaped after ${Math.round(silenceMs / 1000)}s of silence`,
        undefined,
        worker.id,
      );
    }
  }

  for (const task of ctx.db.task.iter()) {
    if (task.slaBreached) continue;
    if (task.status === "approved" || task.status === "done") continue;
    if (task.deadline.toDate().getTime() < nowMs) {
      ctx.db.task.id.update({ ...task, slaBreached: true });
      logEvent(ctx, "sla_breached", `deadline passed: "${task.title}"`, task.id);
    }
  }
});

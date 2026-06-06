import { ScheduleAt, Timestamp } from "spacetimedb";
import { t } from "spacetimedb/server";
import spacetimedb, { reaperTick } from "./schema";
import { applicableLaws } from "./laws";

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

export const init = spacetimedb.init((ctx) => {
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

    const b = ctx.db.building.insert({
      id: 0n,
      address,
      bbl: undefined,
      sqft,
      isAffordable,
      createdAt: ctx.timestamp,
    });

    const laws = applicableLaws(sqft, isAffordable);
    for (const law of laws) {
      const fine = law.fineEstimateUsd(sqft, isAffordable);
      ctx.db.task.insert({
        id: 0n,
        buildingId: b.id,
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
      logEvent(
        ctx,
        "worker_registered",
        `${name} re-registered`,
        undefined,
        existing.id,
      );
      return;
    }

    const w = ctx.db.worker.insert({
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
      w.id,
    );
  },
);

export const heartbeat = spacetimedb.reducer((ctx) => {
  const w = workerBySender(ctx);
  if (!w) throw new Error("heartbeat from unregistered worker");
  if (w.status === "dead") return; // killed workers stay dead; process should exit
  ctx.db.worker.id.update({ ...w, lastHeartbeat: ctx.timestamp });
  logEvent(ctx, "heartbeat", w.name, undefined, w.id);
});

// THE critical reducer: exactly one owner per task.
// Reducer transactionality makes the check-then-set atomic — two workers
// racing on the same task means one commits, the other's transaction fails.
export const claim_task = spacetimedb.reducer(
  { taskId: t.u64() },
  (ctx, { taskId }) => {
    const w = workerBySender(ctx);
    if (!w) throw new Error("claim from unregistered worker");
    if (w.status !== "idle") throw new Error(`worker ${w.name} is not idle`);

    const task = ctx.db.task.id.find(taskId);
    if (!task) throw new Error(`task ${taskId} not found`);
    if (task.status !== "open") throw new Error(`task ${taskId} is not open`);

    ctx.db.task.id.update({ ...task, status: "claimed", claimedBy: w.id });
    ctx.db.worker.id.update({
      ...w,
      status: "working",
      currentTaskId: taskId,
      lastHeartbeat: ctx.timestamp,
    });
    logEvent(
      ctx,
      "task_claimed",
      `${w.name} claimed "${task.title}"`,
      taskId,
      w.id,
    );
  },
);

export const submit_work = spacetimedb.reducer(
  { taskId: t.u64(), body: t.string() },
  (ctx, { taskId, body }) => {
    const w = workerBySender(ctx);
    if (!w) throw new Error("submission from unregistered worker");

    const task = ctx.db.task.id.find(taskId);
    if (!task) throw new Error(`task ${taskId} not found`);
    if (task.status !== "claimed" || task.claimedBy !== w.id) {
      throw new Error(`task ${taskId} is not claimed by ${w.name}`);
    }
    if (body.trim() === "") throw new Error("submission body cannot be empty");

    ctx.db.submission.insert({
      id: 0n,
      taskId,
      workerId: w.id,
      body,
      submittedAt: ctx.timestamp,
    });
    ctx.db.task.id.update({ ...task, status: "in_review" });
    ctx.db.worker.id.update({
      ...w,
      status: "idle",
      currentTaskId: undefined,
      lastHeartbeat: ctx.timestamp,
    });
    logEvent(
      ctx,
      "work_submitted",
      `${w.name} submitted draft for review`,
      taskId,
      w.id,
    );
  },
);

export const approve = spacetimedb.reducer(
  { taskId: t.u64(), note: t.string() },
  (ctx, { taskId, note }) => {
    const task = ctx.db.task.id.find(taskId);
    if (!task) throw new Error(`task ${taskId} not found`);
    if (task.status !== "in_review")
      throw new Error(`task ${taskId} is not in review`);

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
    if (task.status !== "in_review")
      throw new Error(`task ${taskId} is not in review`);

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
    logEvent(
      ctx,
      "task_rejected",
      note || "rejected — returned to queue",
      taskId,
    );
  },
);

// Demo button: simulate a crash. The worker process exits when it sees itself dead.
export const kill_worker = spacetimedb.reducer(
  { workerId: t.u64() },
  (ctx, { workerId }) => {
    const w = ctx.db.worker.id.find(workerId);
    if (!w) throw new Error(`worker ${workerId} not found`);
    if (w.status === "dead") return;

    releaseWorker(ctx, w, "killed");
    logEvent(
      ctx,
      "worker_killed",
      `${w.name} was killed`,
      w.currentTaskId,
      w.id,
    );
  },
);

function releaseWorker(ctx: any, w: any, reason: string) {
  if (w.currentTaskId !== undefined) {
    const task = ctx.db.task.id.find(w.currentTaskId);
    if (task && task.status === "claimed" && task.claimedBy === w.id) {
      ctx.db.task.id.update({ ...task, status: "open", claimedBy: undefined });
      logEvent(
        ctx,
        "task_released",
        `"${task.title}" returned to open (${reason})`,
        task.id,
        w.id,
      );
    }
  }
  ctx.db.worker.id.update({ ...w, status: "dead", currentTaskId: undefined });
}

// Scheduled every 5s: crash recovery + SLA breach flagging.
export const reap = spacetimedb.reducer(
  { arg: reaperTick.rowType },
  (ctx, _args) => {
    const nowMs = ctx.timestamp.toDate().getTime();

    for (const w of ctx.db.worker.iter()) {
      if (w.status === "dead") continue;
      const ageMs = nowMs - w.lastHeartbeat.toDate().getTime();
      if (ageMs > HEARTBEAT_STALE_MS) {
        releaseWorker(ctx, w, "heartbeat stale — presumed crashed");
        logEvent(
          ctx,
          "worker_reaped",
          `${w.name} reaped after ${Math.round(ageMs / 1000)}s silence`,
          undefined,
          w.id,
        );
      }
    }

    for (const task of ctx.db.task.iter()) {
      if (task.slaBreached) continue;
      if (task.status === "approved" || task.status === "done") continue;
      if (task.deadline.toDate().getTime() < nowMs) {
        ctx.db.task.id.update({ ...task, slaBreached: true });
        logEvent(
          ctx,
          "sla_breached",
          `deadline passed: "${task.title}"`,
          task.id,
        );
      }
    }
  },
);

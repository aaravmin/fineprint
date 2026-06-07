import { ScheduleAt, Timestamp } from "spacetimedb";
import { t } from "spacetimedb/server";
import spacetimedb, { reaperTick } from "./schema";
import { reaperRef } from "./reaper-ref";
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
      compliancePlanJson: undefined,
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
        intakeAddress: undefined,
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

// The dashboard's magic moment: one reducer call with a bare address. A
// worker claims the intake task, runs the data pipeline (GeoSearch -> LL84 ->
// covered list -> engine), then calls ingest_building — which spawns the real
// obligations. The intake summary lands in review like any other draft.
export const request_building = spacetimedb.reducer(
  { address: t.string() },
  (ctx, { address }) => {
    if (address.trim() === "") throw new Error("address cannot be empty");

    const alreadyQueued = [...ctx.db.task.iter()].some(
      task =>
        task.kind === "building_intake" &&
        task.intakeAddress === address &&
        (task.status === "open" ||
          task.status === "claimed" ||
          task.status === "in_review"),
    );
    if (alreadyQueued) {
      throw new Error(`an intake for "${address}" is already in the queue`);
    }

    ctx.db.task.insert({
      id: 0n,
      buildingId: 0n,
      lawId: "intake",
      kind: "building_intake",
      title: `Building intake — ${address}`,
      status: "open",
      deadline: addMs(ctx.timestamp, 86_400_000),
      slaBreached: false,
      fineEstimateUsd: undefined,
      claimedBy: undefined,
      intakeAddress: address,
      createdAt: ctx.timestamp,
    });

    logEvent(ctx, "building_requested", `intake queued for "${address}"`);
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
    annualEmissionsTco2E: t.option(t.f64()),
    usesJson: t.string(),
    coveredLawIdsJson: t.string(),
    provenanceJson: t.string(),
    // Current-period LL97 fine in whole dollars, computed by the engine in
    // the ingest pipeline (the module cannot import the engine itself).
    // Absent means the engine had no data; the law's stub estimate applies.
    ll97AnnualFineUsd: t.option(t.u32()),
    // Serialized CompliancePlan from the data layer, same can't-import logic.
    compliancePlanJson: t.option(t.string()),
  },
  (ctx, args) => {
    ingestFromArgs(ctx, args);
  },
);

interface IngestArgs {
  address: string;
  bbl: string;
  sqft: number;
  isArticle321: boolean;
  annualEmissionsTco2E: number | undefined;
  usesJson: string;
  coveredLawIdsJson: string;
  provenanceJson: string;
  ll97AnnualFineUsd: number | undefined;
  compliancePlanJson: string | undefined;
}

// The one place a building comes to exist: called by the ingest_building
// reducer (scripts) and by approve when an intake draft is signed off.
function ingestFromArgs(ctx: any, args: IngestArgs) {
  if (args.address.trim() === "") throw new Error("address cannot be empty");
  if (args.bbl.trim() === "") throw new Error("bbl cannot be empty");

  const existingBuilding = [...ctx.db.building.iter()].find(
    (row: any) => row.bbl === args.bbl,
  );

  if (existingBuilding) {
    ctx.db.building.id.update({
      ...existingBuilding,
      address: args.address,
      sqft: args.sqft,
      isAffordable: args.isArticle321,
      annualEmissionsTco2e: args.annualEmissionsTco2E,
      usesJson: args.usesJson,
      ll97Covered: deriveLl97Covered(args.coveredLawIdsJson),
      provenanceJson: args.provenanceJson,
      compliancePlanJson: args.compliancePlanJson,
    });

    // Fresher data means a fresher fine: keep the LL97 task's estimate in
    // step with the engine instead of letting a stale stub survive.
    if (args.ll97AnnualFineUsd !== undefined) {
      for (const task of ctx.db.task.iter()) {
        const isLl97Task = task.lawId === "ll97" || task.lawId === "art321";
        if (task.buildingId === existingBuilding.id && isLl97Task) {
          ctx.db.task.id.update({
            ...task,
            fineEstimateUsd: args.ll97AnnualFineUsd,
          });
        }
      }
    }

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
    annualEmissionsTco2e: args.annualEmissionsTco2E,
    usesJson: args.usesJson,
    ll97Covered: deriveLl97Covered(args.coveredLawIdsJson),
    provenanceJson: args.provenanceJson,
    compliancePlanJson: args.compliancePlanJson,
    createdAt: ctx.timestamp,
  });

  const coveredLawIds: string[] = JSON.parse(args.coveredLawIdsJson);
  const laws =
    coveredLawIds.length > 0
      ? LAWS.filter(law => coveredLawIds.includes(law.id))
      : applicableLaws(args.sqft, args.isArticle321);

  for (const law of laws) {
    const isLl97Law = law.id === "ll97" || law.id === "art321";
    const engineFine = isLl97Law ? args.ll97AnnualFineUsd : undefined;
    const stubFine = law.fineEstimateUsd(args.sqft, args.isArticle321);

    ctx.db.task.insert({
      id: 0n,
      buildingId: newBuilding.id,
      lawId: law.id,
      kind: law.kind,
      title: `${law.name} — ${args.address}`,
      status: "open",
      deadline: addMs(ctx.timestamp, law.deadlineDays * 86_400_000),
      slaBreached: false,
      fineEstimateUsd: engineFine ?? (stubFine === null ? undefined : stubFine),
      claimedBy: undefined,
      intakeAddress: undefined,
      createdAt: ctx.timestamp,
    });
  }

  logEvent(
    ctx,
    "building_ingested",
    `${args.address} (BBL ${args.bbl}) ingested from city data → ${laws.length} obligations spawned`,
  );
}

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
  { taskId: t.u64(), body: t.string(), payloadJson: t.option(t.string()) },
  (ctx, { taskId, body, payloadJson }) => {
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
      payloadJson,
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

// A worker's dead end: the address didn't survive the geocode gate (or the
// lookup itself blew up in a way retrying won't fix). The reason lands as a
// submission so the dashboard shows why, and the task closes as rejected.
export const fail_intake = spacetimedb.reducer(
  { taskId: t.u64(), reason: t.string() },
  (ctx, { taskId, reason }) => {
    const failingWorker = workerBySender(ctx);
    if (!failingWorker) {
      throw new Error("intake failure came from an unregistered worker");
    }

    const task = ctx.db.task.id.find(taskId);
    if (!task) {
      throw new Error(`no task with id ${taskId}`);
    }
    if (task.kind !== "building_intake") {
      throw new Error(`task ${taskId} is not an intake task`);
    }
    if (task.status !== "claimed" || task.claimedBy !== failingWorker.id) {
      throw new Error(`task ${taskId} is not claimed by ${failingWorker.name}`);
    }
    if (reason.trim() === "") throw new Error("failure reason cannot be empty");

    ctx.db.submission.insert({
      id: 0n,
      taskId,
      workerId: failingWorker.id,
      body: reason,
      payloadJson: undefined,
      submittedAt: ctx.timestamp,
    });
    ctx.db.task.id.update({ ...task, status: "rejected", claimedBy: undefined });
    ctx.db.worker.id.update({
      ...failingWorker,
      status: "idle",
      currentTaskId: undefined,
      lastHeartbeat: ctx.timestamp,
    });

    logEvent(ctx, "intake_failed", reason, taskId, failingWorker.id);
  },
);

export const approve = spacetimedb.reducer(
  { taskId: t.u64(), note: t.string() },
  (ctx, { taskId, note }) => {
    if (workerBySender(ctx)) {
      throw new Error("workers cannot approve drafts — a human signs off");
    }

    const task = ctx.db.task.id.find(taskId);
    if (!task) throw new Error(`task ${taskId} not found`);
    if (task.status !== "in_review") throw new Error(`task ${taskId} is not in review`);

    // Approving an intake is what creates the building: replay the resolved
    // city data the worker attached to its submission.
    if (task.kind === "building_intake") {
      const latestSubmission = [...ctx.db.submission.iter()]
        .filter(submission => submission.taskId === taskId)
        .sort((a, b) => (a.id > b.id ? -1 : 1))[0];

      if (!latestSubmission?.payloadJson) {
        throw new Error(
          `intake ${taskId} has no ingest payload — reject it and re-request the address`,
        );
      }

      ingestFromArgs(ctx, JSON.parse(latestSubmission.payloadJson));
    }

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
    if (workerBySender(ctx)) {
      throw new Error("workers cannot reject drafts — a human signs off");
    }

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

    if (task.kind === "building_intake") {
      // Rejecting an intake means "wrong building" — re-running the same
      // lookup would reproduce the same answer. Terminal; re-request with a
      // corrected address instead.
      ctx.db.task.id.update({ ...task, status: "rejected", claimedBy: undefined });
      logEvent(ctx, "task_rejected", note || "intake rejected", taskId);
      return;
    }

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

// Hand the reducer to the schema's scheduled table (see reaper-ref.ts).
reaperRef.reap = reap;

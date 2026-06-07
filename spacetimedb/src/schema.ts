import { schema, table, t } from "spacetimedb/server";
import { reaperRef } from "./reaper-ref";

// Statuses are plain strings, validated in reducers:
// task:   open | claimed | in_review | approved | rejected | done
// worker: idle | working | dead

export const building = table(
  { name: "building", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    address: t.string(),
    bbl: t.option(t.string()),
    sqft: t.u32(),
    isAffordable: t.bool(),
    // Real-data fields, filled by ingest_building from NYC public datasets.
    // usesJson holds the ESPM use splits ([{group, sqft}]) and provenanceJson
    // the per-field source notes — engine/UI vocabulary, stored as JSON
    // strings to keep the table flat.
    annualEmissionsTco2e: t.option(t.f64()),
    usesJson: t.option(t.string()),
    ll97Covered: t.option(t.bool()),
    provenanceJson: t.option(t.string()),
    createdAt: t.timestamp(),
  },
);

export const task = table(
  { name: "task", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    buildingId: t.u64().index("btree"),
    lawId: t.string(),
    kind: t.string(),
    title: t.string(),
    status: t.string().index("btree"),
    deadline: t.timestamp(),
    slaBreached: t.bool(),
    fineEstimateUsd: t.option(t.u32()),
    claimedBy: t.option(t.u64()),
    // Intake tasks (kind "building_intake") carry the address to look up;
    // buildingId is 0 until the worker ingests the building.
    intakeAddress: t.option(t.string()),
    createdAt: t.timestamp(),
  },
);

export const worker = table(
  { name: "worker", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity().unique(),
    name: t.string(),
    status: t.string(),
    lastHeartbeat: t.timestamp(),
    currentTaskId: t.option(t.u64()),
  },
);

export const submission = table(
  { name: "submission", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    taskId: t.u64().index("btree"),
    workerId: t.u64(),
    body: t.string(),
    submittedAt: t.timestamp(),
  },
);

export const approval = table(
  { name: "approval", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    taskId: t.u64().index("btree"),
    approvedBy: t.identity(),
    verdict: t.string(),
    note: t.string(),
    at: t.timestamp(),
  },
);

// Append-only audit log. Every reducer writes one row.
export const event = table(
  { name: "event", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    kind: t.string(),
    taskId: t.option(t.u64()),
    workerId: t.option(t.u64()),
    payload: t.string(),
    at: t.timestamp(),
  },
);

// Scheduled table: drives the heartbeat reaper every ~5s (see reducers.reap).
// The reducer arrives through reaperRef — see reaper-ref.ts for why.
export const reaperTick = table(
  { name: "reaper_tick", scheduled: (): any => reaperRef.reap },
  {
    id: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  },
);

const spacetimedb = schema({
  building,
  task,
  worker,
  submission,
  approval,
  event,
  reaperTick,
});

export default spacetimedb;

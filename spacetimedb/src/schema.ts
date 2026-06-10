import { schema, table, t } from "spacetimedb/server";
import { reaperRef } from "./reaper-ref";

// Statuses are plain strings, validated in reducers:
// task:   open | claimed | in_review | approved | rejected | done
// worker: idle | working | dead

export const building = table(
  { name: "building", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    // The account that owns this building. Identities derive from the Clerk
    // JWT (iss+sub), so the same login maps to the same owner on any machine.
    owner: t.identity().index("btree"),
    // Always 0. Exists purely so the worker visibility rules can express
    // "workers see every row" as an indexed equi-join — subscriptions reject
    // RLS rules whose joins have no indexed join columns.
    fleetScope: t.u32().index("btree"),
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
    // Real building characteristics from PLUTO and LL84, used by the law
    // registry to decide applicability and statutory cycle dates instead of
    // guessing from floor area. Absent until intake resolves them.
    numFloors: t.option(t.u32()),
    unitsResidential: t.option(t.u32()),
    communityDistrict: t.option(t.u32()),
    energyStarScore: t.option(t.u32()),
    // The whole-building compliance plan (data layer's buildCompliancePlan),
    // serialized at intake time — the module can't import the data layer, so
    // the plan rides in like the engine's fine figure does.
    compliancePlanJson: t.option(t.string()),
    createdAt: t.timestamp(),
  },
);

export const task = table(
  { name: "task", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index("btree"),
    fleetScope: t.u32().index("btree"),
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
    fleetScope: t.u32().index("btree"),
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
    // Denormalized from the task: visibility rules cannot join through task
    // (subscriptions allow a single equi-join, and recursion multiplies).
    owner: t.identity().index("btree"),
    fleetScope: t.u32().index("btree"),
    taskId: t.u64().index("btree"),
    workerId: t.u64(),
    body: t.string(),
    // Intake submissions carry the ready-to-ingest building args as JSON;
    // approval replays them through the shared ingest path. Absent on
    // ordinary drafts.
    payloadJson: t.option(t.string()),
    submittedAt: t.timestamp(),
  },
);

export const approval = table(
  { name: "approval", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    // Denormalized from the task, same single-join constraint as submission.
    owner: t.identity().index("btree"),
    fleetScope: t.u32().index("btree"),
    taskId: t.u64().index("btree"),
    approvedBy: t.identity(),
    verdict: t.string(),
    note: t.string(),
    at: t.timestamp(),
  },
);

// One row per account: that account's switches. reviewMode "manual" means
// every draft waits for a human; "auto" approves obligation drafts on
// submit — building intakes always wait either way. A missing row reads as
// manual.
export const settings = table(
  { name: "settings", public: true },
  {
    owner: t.identity().primaryKey(),
    reviewMode: t.string(),
  },
);

// Append-only audit log. Every reducer writes one row. owner is the account
// whose data the event concerns; fleet-level events (registrations,
// heartbeats, reaps) carry the acting identity and surface only to workers
// and the module owner.
export const event = table(
  { name: "event", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index("btree"),
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

// --- Compliance binder (customer-facing) -----------------------------------
// The owner's organized, exportable compliance record: an obligation per law,
// the proof filed against each, the vendor responsible, and a plain-language
// history. Deliberately separate from the internal `event` audit log — this is
// the owner's record, not developer plumbing.

export const vendor = table(
  { name: "vendor", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index("btree"),
    fleetScope: t.u32().index("btree"),
    name: t.string(),
    company: t.string(),
    roleType: t.string(), // QEWI | LMP | energy_auditor | ... (see VENDOR_ROLES)
    email: t.string(),
    phone: t.string(),
    licenseNumber: t.string(),
    licenseType: t.string(),
    notes: t.string(),
    createdAt: t.timestamp(),
  },
);

export const obligation = table(
  { name: "obligation", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index("btree"),
    fleetScope: t.u32().index("btree"),
    buildingId: t.u64().index("btree"),
    lawId: t.string(),
    title: t.string(),
    status: t.string(), // see OBLIGATION_STATUSES
    dueDate: t.option(t.timestamp()),
    responsibleParty: t.string(),
    vendorId: t.option(t.u64()),
    filingReferenceNumber: t.string(),
    notes: t.string(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
    completedAt: t.option(t.timestamp()),
  },
);

export const evidence = table(
  { name: "evidence", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index("btree"),
    fleetScope: t.u32().index("btree"),
    obligationId: t.u64().index("btree"),
    buildingId: t.u64().index("btree"),
    lawId: t.string(),
    fileName: t.string(),
    fileType: t.string(),
    fileUrlOrKey: t.string(),
    uploadedBy: t.string(),
    uploadedAt: t.timestamp(),
    documentDate: t.option(t.timestamp()),
    expirationDate: t.option(t.timestamp()),
    issuer: t.string(),
    vendorId: t.option(t.u64()),
    filingReferenceNumber: t.string(),
    verificationStatus: t.string(), // see VERIFICATION_STATUSES
    notes: t.string(),
  },
);

export const binderEvent = table(
  { name: "binder_event", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index("btree"),
    fleetScope: t.u32().index("btree"),
    buildingId: t.u64().index("btree"),
    obligationId: t.option(t.u64()),
    lawId: t.string(),
    kind: t.string(),
    summary: t.string(),
    at: t.timestamp(),
  },
);

const spacetimedb = schema({
  building,
  task,
  worker,
  submission,
  approval,
  settings,
  event,
  reaperTick,
  vendor,
  obligation,
  evidence,
  binderEvent,
});

export default spacetimedb;

// Row-level security: each account sees its own rows; registered agent
// workers see everything so they can process any account's tasks. The worker
// table itself stays unfiltered — the agents page shows the fleet to everyone.
// Submissions and approvals inherit task visibility through the join (RLS
// rules apply recursively). Module owner connections bypass all of this.

// The worker rules join through the constant fleetScope columns (always 0 on
// both sides) instead of a bare cross join: subscriptions refuse RLS rules
// whose joins have no indexed join columns, and that refusal poisons every
// table whose rules reference the filtered table recursively.

export const buildingOwnerView = spacetimedb.clientVisibilityFilter.sql(
  "SELECT * FROM building WHERE owner = :sender",
);
export const buildingWorkerView = spacetimedb.clientVisibilityFilter.sql(
  "SELECT building.* FROM building JOIN worker ON building.fleetScope = worker.fleetScope WHERE worker.identity = :sender",
);

export const taskOwnerView = spacetimedb.clientVisibilityFilter.sql(
  "SELECT * FROM task WHERE owner = :sender",
);
export const taskWorkerView = spacetimedb.clientVisibilityFilter.sql(
  "SELECT task.* FROM task JOIN worker ON task.fleetScope = worker.fleetScope WHERE worker.identity = :sender",
);

export const submissionOwnerView = spacetimedb.clientVisibilityFilter.sql(
  "SELECT * FROM submission WHERE owner = :sender",
);
export const submissionWorkerView = spacetimedb.clientVisibilityFilter.sql(
  "SELECT submission.* FROM submission JOIN worker ON submission.fleetScope = worker.fleetScope WHERE worker.identity = :sender",
);

export const approvalOwnerView = spacetimedb.clientVisibilityFilter.sql(
  "SELECT * FROM approval WHERE owner = :sender",
);
export const approvalWorkerView = spacetimedb.clientVisibilityFilter.sql(
  "SELECT approval.* FROM approval JOIN worker ON approval.fleetScope = worker.fleetScope WHERE worker.identity = :sender",
);

export const eventOwnerView = spacetimedb.clientVisibilityFilter.sql(
  "SELECT * FROM event WHERE owner = :sender",
);

export const settingsOwnerView = spacetimedb.clientVisibilityFilter.sql(
  "SELECT * FROM settings WHERE owner = :sender",
);

// The compliance binder is the owner's own record — owner-scoped only, with no
// worker view (agents process tasks, not the customer's binder).
export const vendorOwnerView = spacetimedb.clientVisibilityFilter.sql(
  "SELECT * FROM vendor WHERE owner = :sender",
);
export const obligationOwnerView = spacetimedb.clientVisibilityFilter.sql(
  "SELECT * FROM obligation WHERE owner = :sender",
);
export const evidenceOwnerView = spacetimedb.clientVisibilityFilter.sql(
  "SELECT * FROM evidence WHERE owner = :sender",
);
export const binderEventOwnerView = spacetimedb.clientVisibilityFilter.sql(
  "SELECT * FROM binder_event WHERE owner = :sender",
);

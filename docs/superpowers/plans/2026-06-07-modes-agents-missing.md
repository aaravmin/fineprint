# Modes, per-task agents, missing-data indication

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkboxes track steps.

**Goal:** Review mode (manual/auto) lives in the db and auto-approves obligation drafts; every task is worked by its own short-lived agent identity; the UI says "missing" instead of going quiet.

**Architecture:** A single-row `settings` table + `set_review_mode` reducer; `submit_work` consults it and auto-approves non-intake drafts in the same transaction. The worker process becomes a dispatcher: an observer connection watches open tasks and spawns one fresh connection+identity per task (capped), which registers, claims, works, submits, disconnects — the reaper sweeps the dead row. Client gets a mode toggle (tasks page), a law-coverage strip on the building page, and explicit "missing" labels.

**Tech stack:** unchanged (SpacetimeDB TS module, tsx agents, Next.js client).

---

### Task A: settings table + auto-accept

- [ ] `schema.ts`: `settings` table `{ id u64 pk, reviewMode string }`, public; register in schema().
- [ ] `reducers.ts`: `init` inserts `{ id: 1n, reviewMode: "manual" }`. Helper `currentReviewMode(ctx)` → row?.reviewMode ?? "manual".
- [ ] `set_review_mode { mode }`: validate manual|auto, bar workers, upsert id 1, logEvent.
- [ ] `submit_work`: when mode auto && task.kind !== "building_intake" → status "approved" + approval row (note "auto-approved — review mode is auto") + task_approved event, instead of in_review.
- [ ] `npm run sync` (wipe ok — db disposable), typecheck.

### Task B: per-task agents (agents/src/worker.ts rewrite)

- [ ] Dispatcher connection (anonymous, never registers): subscribes, scans open tasks every 2s, spawns up to `MAX_CONCURRENT` (default 4, env `AGENT_CONCURRENCY`) task agents; tracks in-flight task ids locally.
- [ ] Task agent: fresh DbConnection → registerWorker name `${shortKind}-${taskId}` (e.g. `intake-3`, `ll97-7`) → claimTask(taskId) (lost race → disconnect) → heartbeat interval → run existing intake/draft logic (refactored to take conn) → submitWork/failIntake → disconnect. Reaper turns the abandoned row dead ≤15s later.
- [ ] Existing WORKER_KINDS filter still respected by the dispatcher.
- [ ] Tests: `npm test --workspace agents`, typecheck.

### Task C: missing-data labels + law coverage

- [ ] Portfolio emissions cell: `—` → `missing` (muted italic). Law-tasks cell 0 → `missing`. Fine cells stay numeric.
- [ ] Building page: "Law coverage" card above Compliance tasks — all 8 laws (ll97, art321, ll84, ll87, ll11, ll88, ll152, ll55); each shows live task status badge or destructive-muted "Missing — no record on file".
- [ ] Tasks page header: mode toggle (Switch) bound to settings row via useTable + setReviewMode reducer; label "Auto-approve drafts"; intakes always manual (copy says so).
- [ ] Typecheck, browser check.

### Task D: live E2E

- [ ] Mode manual: draft lands in_review (unchanged). Toggle auto in UI → next draft lands approved without click; intake still waits for human.
- [ ] Agents page: one agent per task appears (intake-N, ll97-M...), goes dead after its task ships.
- [ ] Building page shows Missing rows for uncovered laws; portfolio shows `missing` not dashes.

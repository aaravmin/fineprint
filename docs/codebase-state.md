# Fineprint — codebase state

Snapshot taken 2026-06-07, on `main`, latest commit `eeb67d7` ("Merge for functionality changes").
Personal notes, not a context file.

## What this is

NYC building-compliance pipeline. SpacetimeDB is the entire backend — no API server.
The browser dashboard and Node agent workers both open WebSockets straight to the
database (port 3011). Reads are table subscriptions, writes are reducer calls, nothing
else writes. Agents claim tasks, draft compliance work (LLM or scripted), humans
approve via the dashboard.

## Workspaces

| Package        | What it is                                               | Size                          |
| -------------- | -------------------------------------------------------- | ----------------------------- |
| `spacetimedb/` | The database module: 8 tables, 13 reducers, law registry | 5 src files                   |
| `agents/`      | Worker + reviewer processes, LLM/scripted draft policies | 10 src files, 7 test suites   |
| `client/`      | Next.js 16.2.7 / React 19 dashboard, Clerk auth          | ~30 routes, 90+ UI components |
| `data/`        | NYC open-data fetchers + compliance planning             | 26 modules                    |
| `engine/`      | Pure LL97 fine math, deterministic, no I/O               | 3 files                       |
| `homepage/`    | Separate landing page                                    | 8 files                       |
| `scripts/`     | `ingest.ts` CLI ingestion, demo notes                    | —                             |

~270 TS/TSX source files total.

## The pipeline (how a building gets in)

1. Dashboard calls `request_building` with an address → creates a `building_intake` task.
2. A worker claims it, runs `data/src/intake.ts::prepareIntake()`:
   - `geosearch.ts` geocode gate — street + borough must match or the worker calls
     `fail_intake` (terminal rejection).
   - `lookup.ts` resolves BBL, joins LL84, PLUTO, boilers, permits, DOB covered list
     into `BuildingFacts` with provenance.
   - Engine computes the LL97 fine; `compliancePlan.ts` builds the multi-law plan.
3. Worker submits the draft with `payloadJson` (the ready-to-replay ingest args).
4. Human approves → `approve` replays `payloadJson` through `ingestFromArgs` — the
   building and its obligations are created _inside_ the approve transaction.

## Database module (`spacetimedb/src/`)

Tables: `building`, `task`, `worker`, `submission`, `approval`, `settings`, `event`
(audit log — every reducer writes one), `reaper_tick` (5s schedule).

Reducers: `init`, `add_building`, `request_building`, `ingest_building`,
`register_worker`, `heartbeat`, `claim_task`, `submit_work`, `fail_intake`,
`approve`, `reject`, `kill_worker` (demo), `reap` (scheduled).

Core guarantees:

- `claim_task` is check-then-set in one transaction — exactly one owner per task.
- `reap` every 5s: heartbeat stale >15s → worker marked dead, task back to `open`.
- Workers cannot call `approve`/`reject`.
- Statuses are plain strings validated in reducers: task
  `open | claimed | in_review | approved | rejected | done`, worker `idle | working | dead`.
- `schema.ts` ↔ `reducers.ts` circular import is intentional; the `index.ts` re-export
  order (reducers before schema) makes the lazy scheduled-reducer reference safe.

## Law registry (`spacetimedb/src/laws.ts`, canonical)

Eight laws, each with applicability rule, fine stub, and deadline offset:

| Law                        | Trigger                   | Fine est.                  |
| -------------------------- | ------------------------- | -------------------------- |
| LL97 emissions cap         | ≥25K sqft, not affordable | $268/tCO2e overage         |
| Art. 321 (affordable LL97) | ≥25K sqft, affordable     | prescriptive, no $ penalty |
| LL84 benchmarking          | ≥25K sqft                 | $2,500                     |
| LL87 energy audit          | ≥50K sqft                 | $3,000                     |
| LL11 facade                | ≥60K sqft                 | $5,000                     |
| LL88 lighting/submetering  | ≥25K sqft                 | $1,500                     |
| LL152 gas piping           | all                       | $10,000                    |
| LL55 mold/pest             | residential               | —                          |

## Agents (`agents/src/`)

- `worker.ts` — registers, heartbeats every 5s, ticks every 2s: claim next open task
  (filterable via `WORKER_KINDS`), do the work, submit, back to idle. Exits if marked dead.
- `reviewer.ts` — polls `in_review` tasks every 3s, approves/rejects (LLM or scripted
  verdict depending on `USE_LLM`).
- `policies/llm.ts` — Claude drafting (`claude-haiku-4-5` default, `ANTHROPIC_MODEL`
  override). Tool loop (max 6 rounds) pulls building facts / engine numbers / retrofit
  suggestions via `data/src/tools.ts` — the model never does its own arithmetic.
  Successful drafts cached in `agents/cache/llm/`; any error falls back to scripted.
- `policies/scripted.ts` — template drafts per law kind, the default and the fallback.

Preset launchers: `worker:emissions`, `worker:filings`, `worker:inspections`.

## Client (`client/src/`)

Next.js 16.2.7, React 19, Clerk auth, Tailwind 4, shadcn-based UI, light/dark themes.

Routes: landing `/`, `/sign-in`, `/sign-up`, then `/dashboard` with `tasks` (queue
board), `buildings/[id]` (detail + fine timeline), `portfolio`, `agents` (fleet
status), `activity` (event log). `dashboard/page.tsx` itself is an empty shell
returning null.

Live wiring: `spacetime-provider.tsx` holds the DbConnection + subscriptions;
`agent-status-banner.tsx` shows worker heartbeats; `event-toaster.tsx` pops toasts
off the `event` table. `module_bindings/` in both client and agents are generated —
never hand-edited, regenerated by `npm run generate`.

## Data + engine

- `data/` — Socrata fetchers (LL84, PLUTO, boilers, permits, electrical, ECB, DOB
  covered-buildings list) over a cached HTTP layer; `obligations.ts` +
  `compliancePlan.ts` produce a single multi-law plan per address where one physical
  measure (e.g. LED retrofit) is credited against every law it retires;
  `retrofit.ts` optimizes measure selection; `ask.ts`/`discovery.ts`/`bm25.ts` back
  the LLM advisor.
- `engine/` — pure `computeFine` / `computeAllPeriods` across the three LL97 periods
  (2024–29, 2030–34, 2035–39). No clocks, no network, no env reads. Money rounded
  to the cent, tCO2e to 2 decimals.

## Commands

```bash
spacetime start --listen-addr 127.0.0.1:3011   # db (port 3000 is the dashboard)
npm run sync          # publish module + regenerate bindings (after any schema change)
npm run worker        # WORKER_NAME=atlas npm run worker
npm run reviewer
npm run dashboard     # Next.js on 3000
npm run typecheck
```

Key env: `SPACETIME_URI`, `DB_NAME`, `USE_LLM`, `ANTHROPIC_API_KEY`,
`WORKER_NAME`, `WORKER_KINDS`, `SOCRATA_APP_TOKEN` (optional),
`GEMINI_API_KEY` (set but unused so far).

## Loose ends

- `data/src/compliancePlan.ts:323` — FRONTEND TODO: `explainFineData()` messages
  (why fine data is missing) are computed but not rendered anywhere yet.
- `client/src/app/(main)/dashboard/page.tsx` is empty — the dashboard root needs a
  real overview page.
- Working tree currently has uncommitted edits to `spacetimedb/src/reducers.ts` and
  `spacetimedb/src/schema.ts`, plus an untracked planning doc
  `docs/superpowers/plans/2026-06-07-modes-agents-missing.md`.
- Recent commit themes: agent-orchestration pipeline finished and tested, dashboard
  UI cleanup, event/toast wiring, homepage metrics.

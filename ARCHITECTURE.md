# Fineprint - system architecture

This document describes how Fineprint is built: where data lives, how clients read and write it, how the agent pipeline drafts compliance work, how NYC public data is ingested, and how a customer's buildings are analyzed.
It reflects the code as it actually stands today, which has diverged from `README.md` / `CLAUDE.md` in one major way (see [Migration status](#migration-status)).

## What Fineprint is

Fineprint runs NYC Local Law 97 building compliance as a live "ops room."
An owner adds a building by street address; Fineprint resolves it to a real NYC building from public records, computes its LL97 emissions position and fine exposure with a deterministic engine, infers the building's mechanical systems, and produces a personalized decarbonization plan and a set of exportable compliance documents.
Background AI agents draft the required analyses; a human approves every draft; nothing is guessed - every number comes from the engine or a sourced dataset, and every fact carries a provenance note.

## System at a glance

```
                          ┌───────────────────────────────────────────────┐
                          │                   BROWSER                      │
                          │   Next.js 16 / React 19 dashboard (:3000)      │
                          │   Clerk session → <DataProvider>               │
                          │            └ <SupabaseProvider>                │
                          └──────┬──────────────┬───────────────┬─────────┘
    Clerk → HS256 Supabase JWT  │              │ Realtime       │ direct RLS
       (sub = owner)            │ write path   │ (postgres_     │ writes
                                ▼              │  changes,      │ (binder,
   ┌────────────────────────────────────┐     │  RLS-scoped)   │  settings,
   │  Next.js route handlers  /api/*     │     │                │  documents)
   │  tasks · approve · reject · done ·  │     │                │
   │  settings · seed-obligations ·      │     │                │
   │  supabase-token                     │     │                ▼
   │  → service-role admin client        │     │        ┌───────────────────────────┐
   │    (verifies owner + transition)    │     │        │   SUPABASE                │
   └──────┬───────────────────────┬──────┘     │        │   Postgres + RLS +        │
          │ service-role writes    │ tasks.     │        │   Realtime +              │
          ▼                        │ trigger(   │        │   private "evidence"      │
   ┌─────────────────────────┐     │  "intake-  │        │   Storage bucket          │
   │  SUPABASE POSTGRES       │◄────┼── run")    │        └───────────────────────────┘
   │  owner-scoped tables     │     │                         ▲
   │  RLS via requesting_     │     ▼                         │ service-role writes
   │  owner();  ingest_       │  ┌──────────────────────────────────────────────┐
   │  building()/log_event()  │  │             TRIGGER.DEV CLOUD                 │
   │  = service_role only     │  │  intake-run task (agents/src/trigger)        │
   └─────────────────────────┘  │   • prepareIntake (data/ pipeline)           │
                                 │   • scripted or Claude (USE_LLM) drafting    │
                                 │   • fineprint-engine LL97 math               │
                                 └──────────────────┬───────────────────────────┘
                                                    │ HTTPS
                                                    ▼
                                 ┌──────────────────────────────────────────────┐
                                 │        NYC OPEN DATA  (data/ pipeline)        │
                                 │  GeoSearch (addr→BBL, borough gate) · PLUTO · │
                                 │  LL84 · DOB/HPD/ECB/DEP-CATS · DOB NOW        │
                                 └──────────────────────────────────────────────┘

Reads  = browser subscribes to Supabase Realtime (RLS-scoped), never polling.
Writes = state-machine tables via service-role /api routes only; the "binder"
         + settings + documents tables direct from the browser under RLS.
Every write path appends one `events` audit row.
```

## Monorepo layout

The repo is an npm-workspaces monorepo.
The root `package.json` declares four workspaces: `client`, `agents`, `engine`, `data`.
`supabase/` is a plain directory (the Supabase CLI project), not a workspace.

| Directory | Workspace | Responsibility | Stack |
| --- | --- | --- | --- |
| `client/` | `fineprint-client` | The dashboard and the server-side write path: portfolio view, per-building compliance pages, the review queue, the Next.js API route handlers (`src/app/api/*`), and the Supabase data layer (`src/lib/supabase/*`, `src/lib/data/*`). | Next.js 16 / React 19, TypeScript, Tailwind v4, shadcn/ui, Recharts, Zustand, Biome. `next dev -p 3000`. |
| `agents/` | `fineprint-agents` | The AI worker: a Trigger.dev task (`src/trigger/intake-run.ts`) that resolves intakes and drafts filings. Drafting policies in `src/policies/` (scripted + Claude). | TypeScript on Node. `@anthropic-ai/sdk`, `@supabase/supabase-js`, `@trigger.dev/sdk`. Vitest. |
| `engine/` | `fineprint-engine` | Pure, deterministic LL97 fine math and the retrofit optimizer. Zero runtime dependencies. Golden-tested against DOB's published example. | Pure TypeScript. Vitest. |
| `data/` | `fineprint-data` | NYC Open Data ingestion, the intake pipeline, the systems dossier, the compliance plan, obligations, personalized measures, and the law registry (`data/laws.ts`). | TypeScript. `xlsx`. Vitest. |
| `supabase/` | (dir) | The Postgres backend: `config.toml` + `migrations/0001…0006_*.sql` (schema, RLS, functions, Realtime/Storage, building documents, records/deadlines). | SQL migrations + Supabase CLI. |
| `homepage/` | (dir) | Marketing site. |
| `preview/` | (dir, untracked) | Rendered previews of the "Prepared by Fineprint" deliverables (screenshots + HTML). |

Cross-workspace wiring: the client resolves `import ... from "fineprint-engine"` and `"fineprint-laws"` through tsconfig path aliases (`client/tsconfig.json` → `../engine/src/index.ts` and `../data/laws.ts`).
`agents/` and `data/` import the engine by relative path (`../../engine/src/index.ts`); they define no aliases.

## Migration status

Fineprint began on **SpacetimeDB** (WebSocket tables + reducers + a scheduled reaper, no API server).
It has since migrated to **Supabase (Postgres + RLS + Realtime + Storage) + Trigger.dev**, with Clerk unchanged.

That migration is effectively complete in the code, ahead of the written docs:

- SpacetimeDB is gone from the tree.
  `spacetimedb/`, `agents/src/worker.ts`, and both `module_bindings/` directories were deleted (in commit `922c8a4`); `git ls-files` returns zero SpacetimeDB files.
- The client mounts Supabase unconditionally.
  `client/src/components/data-provider.tsx` renders `<SupabaseProvider>` with no branch; there is no live `NEXT_PUBLIC_DATA_BACKEND` toggle anymore (the env var and one stale comment survive as documentation drift).
- The agent is a Trigger.dev task, not a worker process.

`README.md` and `CLAUDE.md` still describe the SpacetimeDB backend, `spacetime start`, `publish:local`, the worker fleet, `claim_task`, and the 5s reaper.
Treat those as the historical design; the sections below describe the current system.
`docs/migration-supabase-trigger.md` is the migration's design intent (it still lists a not-yet-built Trigger.dev "scheduled sweep" that would set `tasks.sla_breached` and rescue stuck runs - nothing sets `sla_breached` today).

## Where data is stored

### Supabase Postgres - the canonical store

One hosted Supabase Postgres database holds all application state.
Every table carries an `owner text` column: the Clerk user id (the JWT `sub`), which is the key every row is scoped and secured on.
Ids are `bigint generated always as identity`; timestamps are `timestamptz`; former JSON-string columns are native `jsonb`.

Tables fall into two access shapes (this split is the backbone of the security model, see [Row-level security](#row-level-security-and-multi-tenancy)):

**State-machine and audit tables** - owner may only `SELECT`; all writes go through the service role.

| Table | Purpose | Notable columns |
| --- | --- | --- |
| `buildings` | The core entity: a physical building and its computed compliance profile. | `address`, `bbl`, `bin`, `sqft`, `is_affordable`, `annual_emissions_tco2e`, `uses_json` (jsonb), `ll97_covered`, `provenance_json` (jsonb), `num_floors`, `units_residential`, `community_district`, `energy_star_score`, `compliance_plan_json` (jsonb). Upserted by `(owner, bbl)`. |
| `tasks` | One unit of work: an intake to resolve or a per-law obligation to draft. | `building_id` (null until ingest), `law_id`, `kind`, `status` (`open│running│in_review│approved│rejected│done│failed`), `deadline`, `sla_breached`, `fine_estimate_usd`, `intake_address`, `trigger_run_id`. Partial unique index on `(owner, intake_address)` for live `building_intake` tasks stops duplicate intakes. |
| `submissions` | The agent-produced draft for a task. | `task_id`, `agent_name`, `body`, `payload_json` (jsonb; non-null only for intakes - the ready-to-ingest building args). |
| `approvals` | The human (or auto) verdict on a draft. | `task_id`, `approved_by`, `verdict`, `note`. |
| `events` | Append-only audit log; every write path appends one row. | `kind`, `task_id`, `payload` (plain text summary). |
| `system_deadlines` (0006) | Derived per-system inspection/cert "act-by" deadlines. | `system_key`, `kind` (`boiler_inspection│cats_cert_expiry│elevator_cat1│elevator_periodic`), `due_date`, `act_by_date`, `status`. Unique `(building_id, system_key, kind)`. |

**Owner-owned tables** - the customer's own records, full owner CRUD directly from the browser.

| Table | Purpose | Notable columns |
| --- | --- | --- |
| `settings` | One row per account. | `owner` (PK), `review_mode` (`manual│auto`). |
| `vendors` | Contractors/professionals in the compliance binder. | `name`, `company`, `role_type`, `email`, `license_number`, `license_type`. |
| `obligations` | A tracked compliance obligation for a building. | `building_id`, `law_id`, `status`, `due_date`, `responsible_party`, `vendor_id`, `filing_reference_number`, `completed_at`. |
| `evidence` | A file attached to an obligation as proof. | `obligation_id`, `building_id`, `law_id`, `file_name`, `storage_path`, `document_date`, `expiration_date`, `issuer`, `verification_status`. |
| `binder_events` | Per-building plain-language activity log (distinct from `events`). | `building_id`, `obligation_id`, `law_id`, `kind`, `summary`. |
| `building_documents` (0005) | The standardized, exportable document library. | `building_id`, `storage_path`, `file_name`, `doc_type`, `document_date`, `reference_number`, `note`. |
| `user_records` (0006) | Metadata for an owner-uploaded file (blueprint, inspection report, spec sheet, utility bill), optionally tied to a system. | `building_id`, `system_key`, `record_type`, `file_name`, `storage_path`. |
| `building_overrides` (0006) | The owner's corrections to the inferred systems dossier - one row per building. | `building_id` (PK/FK), `data` (jsonb: `{ [systemKey]: { [field]: { value, recordId?, enteredAt? } } }`). |

Two SQL functions, both `security definer`, restricted to `service_role` (EXECUTE explicitly revoked from `anon`/`authenticated` - a plain revoke-from-PUBLIC is not enough on hosted Supabase):

- `log_event(p_owner, p_kind, p_payload, p_task_id)` - inserts one `events` row (the "every mutation writes an event" invariant).
- `ingest_building(p_owner, p_building jsonb, p_tasks jsonb, p_ll97_fine)` - the atomic intake write.
  It upserts the building by `(owner, bbl)`, inserts only the covered-law tasks the building does not already have (dedup by `(building_id, law_id)`), refreshes the `ll97`/`art321` fine estimate, and logs one event - all in one transaction.
  The law registry is TypeScript, so the caller computes the full building row and task set in TS and hands them here as jsonb; this function only does the atomic write.

### Supabase Storage

A single **private** bucket named `evidence` holds all uploaded files.
Object keys always begin with the owner's Clerk id, and storage RLS keys on that first path segment (`(storage.foldername(name))[1] = requesting_owner()`), so an account can only touch objects under its own prefix:

- Obligation evidence: `<owner>/<obligation_id>/<filename>`
- Building documents: `<owner>/documents/<building_id>/...`
- User records: `<owner>/records/<building_id>/...`

Uploads have a 25 MB client-side pre-check.
The DB columns `evidence.storage_path`, `building_documents.storage_path`, and `user_records.storage_path` hold these object keys.

### The `data/` datasets and caches

The `data/` workspace stores the NYC data assets and an offline-resilience cache (all on disk / in the repo, not in Postgres):

- `data/cbl/cbl26.json.gz` - a committed FY2026 DOB Covered Buildings List snapshot (~29,000 covered BBLs, LL97 coverage + Article 321 pathway). Rebuilt yearly, not fetched live.
- `data/cache/<service>/<sha1(url)>.json` - a live-then-cache snapshot store. Every fetch is served live; the disk snapshot is only consulted when the network fails (offline resilience, not freshness - no TTL). App tokens are stripped from cache keys so secrets never hit disk.
- `data/nyc_cost_sources/`, `data/nrel/`, `data/remdb/`, `data/normalized/` - the retrofit cost/savings source files and their normalized outputs (see [Cost and savings sources](#cost-and-savings-sources)).
- `data/corpus/ll97.json` - the LL97 statute/rule text for the `ask_law` retrieval tool (not part of building ingestion).

### The two persisted JSON blobs

Two computed artifacts ride on the `buildings` row as jsonb and are the contract between the ingest pipeline and the dashboard:

- `compliance_plan_json` - the whole-building `CompliancePlan`: pathway, measures, dispositions, cross-credits, `fineData`, and `personalization: { systems, measures }`.
- `uses_json` - the ESPM occupancy/use split (`[{ group, sqft }]`) the engine needs.

(Drift note: `data/src/intake.ts` also emits `systemsJson` and `systemDeadlinesJson`, but the current Supabase ingest path persists neither as its own column - the systems dossier is read from `compliance_plan_json.personalization.systems` instead. `client/src/lib/data/shape.ts` hardcodes `Building.systemsJson = undefined`.)

## How clients access data

### Authentication

Clerk owns login; Supabase authorization is a locally-minted JWT.

1. `<ClerkProvider>` wraps the app (`client/src/app/layout.tsx`); the Clerk middleware in `client/src/proxy.ts` protects every route except `/`, `/sign-in`, `/sign-up`.
2. `client/src/lib/supabase/token.ts` (`signSupabaseToken`) mints an HS256 JWT with `jose`, signed with `SUPABASE_JWT_SECRET`, setting `sub` = the Clerk user id, `role`/`aud` = `authenticated`, 1-hour expiry.
   That `sub` is exactly what every RLS policy reads and what every row's `owner` column holds.
   (Fineprint deliberately does not use Clerk's Supabase third-party-auth dashboard integration - it signs its own token.)
3. The browser gets its token from `GET /api/supabase-token` (401 when signed out, so an unauthenticated client stays anonymous and RLS returns nothing).
   `client/src/lib/supabase/browser.ts` caches and refreshes it and hands it to supabase-js as the `accessToken`, which scopes both REST and Realtime.
4. Server-side reads use `client/src/lib/supabase/server.ts` (mints the same token inline); route handlers that need to bypass RLS use the service-role admin client `client/src/lib/supabase/admin.ts` (`SUPABASE_SERVICE_ROLE_KEY`, server-only).

### Reads - Realtime subscriptions

The browser never polls; it subscribes to Supabase `postgres_changes` and reconstructs a gapless snapshot.

`client/src/lib/data/useRealtimeTable.ts` is the core primitive.
Supabase delivers only deltas, so it: opens the channel and buffers any early delta, then on `SUBSCRIBED` takes an authoritative `select("*")` snapshot into a `Map` keyed by `id`, replays the buffered deltas, and applies subsequent deltas live.
Because the buffer opens before the select, no row committed in the gap is lost, and the `SUBSCRIBED` callback re-syncs on reconnect.
RLS scopes both the snapshot and the change feed to the account.

`client/src/lib/data/hooks.ts` exposes one thin hook per table (`useBuildings`, `useTasks`, `useObligations`, `useEvidence`, `useBuildingDocuments`, `useVendors`, `useBinderEvents`, `useEvents`, `useSettingsRows`).
`useWorkers` has no table - there is no persistent fleet, so it derives synthetic "agents" from the `running` tasks.
`client/src/lib/data/shape.ts` maps snake_case Supabase rows into the app's row shapes (`bigint` ids, a `{ toDate() }` timestamp stand-in, camelCase) so the UI code was never rewritten during the migration.

### Writes - two shapes

**(a) Owner-owned tables, written directly from the browser under RLS.**
The binder, settings, and document tables carry `owner` and permissive-for-owner RLS, so `client/src/lib/data/mutations.ts` writes them straight through the RLS browser client, stamping `owner: userId`.
Examples: `useAddVendor`, `useSetObligationStatus`, `useAddEvidence`, `useUploadBuildingDocument` / `useDeleteBuildingDocument` (which also upload/remove the storage object).

**(b) State-machine transitions, via service-role API routes.**
`tasks`/`buildings`/`settings`/`events` are read-only under RLS, so transitions go through Next.js route handlers under `client/src/app/api/`, each of which calls Clerk `auth()` (401 if signed out), **explicitly checks `row.owner === userId`**, and writes with the service-role admin client:

- `POST /api/tasks` (`useRequestBuildingCall`) - insert an `open` `building_intake` task, event, then fire the agent via `dispatchTaskRun` (`client/src/lib/jobs/dispatch.ts`).
- `POST /api/tasks/[id]/approve` (`useApprove`) - for an intake, replay the agent's `payload_json` through the `ingest_building` RPC (via `client/src/lib/supabase/ingest.ts`), record the approval, then dispatch an agent per freshly-spawned obligation task.
- `.../reject`, `.../done`, `POST /api/settings`, `POST /api/buildings/[id]/seed-obligations`.

Every route also appends an `events` row.

### Row-level security and multi-tenancy

`public.requesting_owner()` returns `coalesce(auth.jwt() ->> 'sub', '')` - the verified Clerk id, unspoofable by the client.

- State-machine + audit tables get a single `SELECT` policy `using (owner = requesting_owner())` and no write policies, so the browser cannot forge a task transition, an approval, or an audit row.
- Owner-owned tables get four policies (`select`/`insert`/`update`/`delete`), each gated on `owner = requesting_owner()` (inserts/updates also `with check`), so the owner has full CRUD but only over their own rows.
- Base privileges are granted explicitly (`grant select … to authenticated`, `grant all … to service_role`); Supabase's implicit defaults did not cover these tables.
- Two independent gates must both pass for any read/write: the table GRANT, and the RLS `owner` comparison. A browser holding account A's token literally cannot see or write account B's rows.
- The `service_role` key (Trigger.dev job + API routes) bypasses RLS - that is the trusted path that writes any account's rows, after the routes verify ownership.
- The `security definer` functions (`ingest_building`, `log_event`) take an explicit `p_owner` and are revoked from `anon`/`authenticated`; otherwise a browser with the anon key + a Clerk token could forge rows into any account.

## The agent / worker pipeline

Agents drain the task queue.
Each task is one unit of compliance work for one building; an agent turns it into a reviewable draft.
The agent never invents a number - every figure comes from the engine or a sourced data tool, and every draft ends with a `Sources:` provenance footnote.

### Task lifecycle

`request → open task → agent drafts a submission → human (or auto) approval → ingest.`

1. **Request.** `POST /api/tasks` inserts an `open` `building_intake` task under the verified owner and fires the agent. Duplicate live intakes for one address hit the partial unique index (409).
2. **Draft.** The Trigger.dev `intake-run` task marks the task `running`, branches on `kind`, and for an intake calls `prepareIntake(address)`; for a drafting kind it builds a `DraftInput` and runs a policy. It writes a `submissions` row and moves the task to `in_review`.
3. **Approval.** A human approves/rejects. Rejecting an ordinary draft returns the task to `open`; rejecting an intake is terminal (re-running the same lookup reproduces the same answer).

### Approve-then-ingest

The building is not created when the agent runs intake.
The agent only resolves and proposes: it attaches the fully-resolved city data as `payload_json` and leaves the task in review.
The building comes into existence only when a human approves, which replays that payload through the atomic `ingest_building` RPC - creating the building and spawning all its obligation tasks together, then dispatching an agent for each.
Auto-approve (`settings.review_mode = 'auto'`) exists for ordinary drafts only; intakes always require a human.

**The geocode gate.**
`prepareIntake` rejects wrong-street / wrong-borough matches by throwing a `GeocodeRejectionError`.
The agent treats a geocode rejection as terminal (task → `rejected`, `intake_failed`); any other intake failure becomes an honest "INTAKE FAILED" report submitted for review; only genuine DB errors bubble up to the platform's retry.

### Scripted vs LLM drafting

`agents/src/draftInput.ts` (`draftInputFrom`) is the pure boundary: it parses the building's JSON columns and ranks the top emissions drivers and top personalized measures, degrading corrupt JSON to empty rather than throwing.

- **Scripted policy** (`agents/src/policies/scripted.ts`, the default, zero-LLM) - deterministic templates keyed by `kind`. The demo runs with no API keys. All numbers come from `agents/src/projections.ts`, which calls the engine's `computeAllPeriods` / `optimizeRetrofit`; missing data omits a section rather than inventing one.
- **LLM policy** (`agents/src/policies/llm.ts`, opt-in via `USE_LLM=true` + `ANTHROPIC_API_KEY`) - a tool-using Claude loop that must pull every fact and dollar figure through `executeDataTool` (`assess_building`), forbidden from doing its own arithmetic; defaults to `claude-haiku-4-5`, max 6 tool rounds. Defensively wrapped: no key falls back to cache then scripted; success writes a cache file; any failure serves cache or scripted.
- Separately, `agents/src/ai/advise.ts` writes a generative one-page owner board summary (default `claude-opus-4-8`, no tools, still may not produce its own number).

### Orchestration

The old lease-and-reap (`claim_task` transaction + a 5s reaper returning crashed-agent tasks to `open`) has been replaced by the Trigger.dev platform:

| Old (SpacetimeDB) | Now (Trigger.dev + Supabase) |
| --- | --- |
| Dispatcher polls the queue, spawns agents | `dispatchTaskRun` triggers `intake-run` from an API route |
| `claim_task` transaction = exactly one owner | `idempotencyKey = intake-<taskId>` makes trigger exactly-once; a retried route call reuses the run |
| Heartbeat + concurrency cap | Platform-managed concurrency |
| `reap` returns crashed tasks to `open` | Platform retry (`maxAttempts: 3`, backoff), task stays `running` between attempts |
| Reaper marks stale workers dead | `onFailure` sets the task `failed` after retries |

The agent authenticates with the service-role key (`agents/src/trigger/supabase.ts` `createJobSupabase`), which bypasses RLS - the privilege the old module gave registered workers.
There is no per-agent identity or `worker` row anymore.

### Task kinds

The law registry is LL97-only today, so three `kind`s are live:

- `building_intake` ("intake") - resolve an address into a building; the only kind producing a non-null `payload_json` and the only kind never auto-approved.
- `emissions_fine_analysis` ("ll97") - the Article 320 emissions-fine exposure analysis.
- `prescriptive_measures_plan` ("art321") - the Article 321 affordable-housing prescriptive-measures plan.

## The data ingestion pipeline

The contract of the `data/` workspace: an address string goes in, and engine-ready `BuildingFacts` plus a serialized compliance dossier come out, every field tagged with the dataset that produced it.
`lookupBuilding(address)` orchestrates the lookup; `prepareIntake(address)` wraps it with the full analysis and packages the `ingest_building` args.

### End-to-end flow

1. **Address → BBL candidates.** `geosearch.ts` calls NYC GeoSearch (Pelias) and returns all ranked candidates (BBL, BIN, borough), deduped by BBL.
2. **The geocode gate.** `resolveBbl` / `assessGeocode` do their own street + borough comparison (Pelias's own confidence is useless - it reports the same score for perfect and garbage matches). A normalized street mismatch or wrong borough rejects; if none survive, it throws `GeocodeRejectionError`. Among survivors it prefers the highest-ranked candidate whose house number DOF actually knows, but never silently substitutes a different house number.
3. **Fetch the record set** (BBL- and BIN-keyed, in parallel), each fetch pushing a provenance note.
4. **Build `BuildingFacts`** with a per-field provenance array and `null` for anything the city cannot answer. Floor-area precedence LL84 → CBL DOF → PLUTO; emissions preferring the DOB-way recompute from LL84 fuel columns, else ESPM's as-filed figure.
5. **Produce the `ingest_building` args** on one shared `asOf` clock so the dossier, deadlines, obligations, and plan are internally consistent.

### NYC datasets

BBL is the universal join key; most equipment history keys by BIN.

| Dataset | Socrata ID | Key | Contributes |
| --- | --- | --- | --- |
| NYC GeoSearch (Pelias) | *(not Socrata)* | address → BBL/BIN | Address resolution, borough |
| LL84 Benchmarking | `5zyy-y8am` | BBL | Floor area, use splits, per-fuel energy, emissions, ENERGY STAR score, heating fuel |
| DOB Covered Buildings List | *local snapshot* | BBL | LL97 coverage, Article 321 pathway, DOF sqft |
| NYC PLUTO | `64uk-42ks` | BBL | Floors, building class, area, units, year built, owner name, community district |
| DOB Permit Issuance (BIS) | `ipu4-2q9a` | BIN | Vintage signal; boiler permits date the heating plant |
| DOB Job Filings (BIS) | `ic3t-wcy2` | BIN | Free-text jobs: boiler / oil-to-gas / heat pump / chiller / roof / window / solar |
| DOB Violations | `3h2n-5cm9` | BIN | Elevator + low-pressure-boiler violations |
| HPD Maintenance Violations | `wvxf-dwi5` | BIN | Heat/hot-water violation density |
| HPD Complaints | `ygpa-z7cr` | BBL | Tenant heat/hot-water complaint density |
| DEP Clean Air Tracking (CATS) | `f4rp-2kvy` | BIN | Registered boiler fuel, make/model, in-service dates |
| DOB NOW: Elevator Devices | `e5aq-a4j2` | BIN | Device count/status, Cat-1 + periodic inspection dates |
| DOB NOW: Electrical | `dm9a-ab7w` | BIN | Solar PV + battery-storage evidence |
| DOB NOW: Safety Boiler | `52dp-yji6` | BIN | Boiler inventory + inspection history |
| DOB NOW: Build Job Filings | `w9ak-ipjd` | BIN | Structured per-system work-type flags |
| DOB ECB Violations | `6bgk-3dad` | BIN | Open violations with dollar balances |

Fetching (`http.ts`/`socrata.ts`) pages at Socrata's 50k-row max, retries with backoff on 429/5xx, and attaches `SOCRATA_APP_TOKEN` when set.

### The building systems dossier

`assessBuildingSystems(facts, asOf, overrides)` (`data/src/buildingSystems.ts`) infers eight systems, each a `SystemAssessment` with `presence` (confirmed/assumed/none/unknown), `fuel`, `vintageYear`, `condition` (failing/aging/serviceable/recently_replaced/unknown), `estAnnualTco2e`, `shareOfEmissions`, `confidence`, and an `evidence[]` array (dataset + record id + date + a human sentence).

The eight `SystemKey`s: `heating_plant`, `domestic_hot_water`, `cooling`, `envelope`, `solar_pv`, `elevators`, `electrical_service`, `lighting`.
"Unknown" is a legitimate answer - the dossier is a draft the owner confirms, never guessed ground truth (owner corrections live in `building_overrides`).
Emissions are split across systems using coarse CBECS/RECS end-use shares keyed by dominant use.
The one place it reasons past a single source is heating fuel: an electricity-only LL84 filing for an old multifamily is distrusted when DEP CATS shows recent fossil combustion, reconciled to CATS at low confidence with both sources cited.

### The compliance plan and obligations

`buildCompliancePlan(facts, { asOf, systems })` (`data/src/compliancePlan.ts`) joins the obligation set to the retrofit optimizer so each physical measure is credited once:

- **Pathway** - `standard` (Article 320 cap) / `article321` / `null`.
- **Measures** - the optimizer's picks from the building's personalized catalog.
- **Dispositions** - one per obligation (`retrofit_measures` / `filing` / `already_compliant` / `needs_attention`).
- **Cross-credits** - a measure that also retires a procedural law is credited once and surfaced structurally.
- **Prioritized actions** - `priorityScore = exposure × (1 + extraLaws × 0.5)`, so an overlap fix that clears two fines outranks an equal-exposure fix that clears one.
- **`fineData`** - a cause-first explanation of why fines are/aren't shown (`available` / `not_applicable` / `covered_unfiled` / `data_incomplete` / `error`); "no data" is never collapsed to a bare "not applicable."

`assessObligations` (`data/src/obligations.ts`) reduces each law to obligations of two kinds: procedural (filing before a deadline, fixed penalty) and performance (holding emissions under a cap, carrying the engine's `FineResult[]`).
Two analyzers are wired (`ll97Analyzer`, `article321Analyzer`).
Inspection-driven "act-by" deadlines (boiler annual, DEP CATS expiry, elevator Cat-1 + periodic) come from `systemDeadlines.ts` and populate `system_deadlines`.

### Cost and savings sources

Per-building recommendations (`data/src/personalizedMeasures.ts`, a ~22-entry catalog) are grounded in a master cost/savings table built offline (`data/scripts/` → `data/normalized/`) from three source families:

- **NYC retrofit cost PDFs** (NYSERDA / Urban Green) - NYC-specific costs, first priority.
- **NREL ResStock NY** - per-upgrade energy + bill savings curves (climate zone 4A) - the savings source.
- **NREL REMDB** (`.xlsx`) - a national cost regression - the cost fallback where no NYC PDF exists.

`merge-measures.ts` merges these into ~14 master measures (cost NYC-PDF → REMDB, savings ResStock), preserving sources and confidence, inventing nothing.
`personalizeMeasures` then scales those to the building via a COP model for fuel switches (a worse boiler yields a larger cut) and per-unit / per-sqft / per-building / per-elevator cost scaling, setting aside already-done or non-applicable measures with evidence-cited reasons.

## The deterministic engine

`engine/src/` is pure - no clocks, no network, same input always yields the same output - and is the single source of every number shown to a user. The LLM never does arithmetic.

### Fine math

`computeFine(building, period)` (`engine/src/index.ts`):

- **Input** `BuildingInput`: `grossFloorAreaSqft`, `occupancyGroups: [{ group, sqft }]` (mixed-use splits area by use), `annualEmissionsTco2e`, `isArticle321?`.
- **Limit** = occupancy-weighted sum: `Σ factorFor(group, period) × sqft`.
- **Overage** = `max(0, emissions - limit)`; **fine** = `round(overage × 26_800 cents)` = **$268 per tCO2e** over the cap (1 RCNY 103-14(h)). Flat linear, no tiering. Money runs in integer cents, emissions round to two decimals to match DOB's example.
- **Three periods** `2024-2029 / 2030-2034 / 2035-2039` (`computeAllPeriods`).
- **Two coefficient tables** (`constants.ts`): a ~60-row ESPM property-type table (the authoritative one, verbatim from 1 RCNY 103-14(d)(3)), and a 14-row statutory occupancy-group letter table (Admin Code 28-320.3, only through 2034). A letter group used for 2024-2034 is flagged "treat as an estimate"; for 2035-2039 it falls back through an explicitly-unofficial ESPM proxy and is flagged. These flags become the "estimate/unverified" caveats in the exported reports.
- **Article 321** (`computeArticle321Result`): affordable/rent-regulated buildings are exempt from the $268/tCO2e penalty (they comply once, via prescribed measures or by meeting the 2030 limit early). Returns `annualFineUsd: 0`, `compliant: true`, and reports the 2030-2034 limit as the performance target. Flat $10,000 non-compliance penalties are noted, not modeled.

### Retrofit optimizer

`engine/src/retrofit.ts` adds capex arithmetic on top of the fine math; capex/savings are editorial "typical NYC building" assumptions, each carrying a `basis` string.

- **Measures** carry `capexUsdPerSqft`, a multiplicative `emissionsReductionFraction`, optional `satisfiesLaws[]` (procedural laws a physical measure also retires), `exclusiveGroup` (mutually exclusive alternatives), and `reducesEmissions` (false = an enabling cost like a service upgrade).
- **`optimizeRetrofit`** enumerates all `2^n` subsets (capped at 16 measures), skips exclusive-group conflicts, projects emissions (`Π(1-fraction)`) back through `computeFine` for all three periods, and minimizes `totalCost = capex + horizonFines - proceduralCredit` (16-year horizon; each avoidable procedural penalty credited once per law).
- **MACC** (`maccCurve`) - one point per measure, `usdPerTco2e = capex / (annualReduction × 16)`, sorted cheapest-abatement-first.
- **`planForBudget`** (best plan within $X) and **`planFromFunding`** (per-measure slider; a partially funded measure delivers a proportional cut and only satisfies a procedural law when fully funded).
- **`optimizeArticle321`** flips the objective: minimize capex subject to clearing the 2030 target.

The client (`client/src/lib/engine.ts`) re-runs this same pure engine in the browser off the live building row, so ROI sliders recompute instantly against the building's own personalized catalog.

## Customer profile analysis

### One building

A building's profile is assembled once at intake (persisted to `compliance_plan_json`) and re-rendered live:

- **Identifiers** - the `buildings` row (BBL/BIN are the stable join keys to any city dataset).
- **Emissions position** - `computePeriods(building)` drives the fine timeline, over/under-cap status, and the per-period limit-vs-actual-vs-overage-vs-penalty table.
- **Systems dossier** - `personalization.systems` (the eight systems, each with fuel/vintage/condition/emissions-share/confidence/evidence).
- **Personalized measures** - `personalization.measures` (each with applicability, `estReductionTco2e`, `capexUsd`, `costPerTco2eAvoided`, `why`, evidence).
- **The exportable binder** (`client/src/lib/compliance/binder.ts`) - the owner's defensible record; `coverageFor` matches uploaded evidence against each law's checklist and surfaces missing required proof.
- **The professional compliance report** (`client/src/lib/output/complianceReportTemplate.ts`) - a consultant-style deliverable with per-law status, exposure as records-based estimates, and a "not tracked reason" so a non-binding law is explained, never dropped.

### The deliverables (the newest owner-facing layer)

`client/src/lib/deliverables/` produces the "Prepared by Fineprint" set - clean one-page documents, each exportable to CSV and print/PDF, built only from known-or-owner-confirmed data:

- **Emissions position** (`emissions.ts`) - the numbers an owner takes to their Article 320 report in DOB NOW: BEAM: identifiers, status/over-cap/penalty stats, and the three-period table. Says "Awaiting benchmarking" rather than fabricate.
- **Decarbonization plan** (`decarbonization.ts`) - the recommended retrofit path (best value first), with total cut, est. capital, and a projected "under the cap / still over by X" position.
- **Document library** (`documentLibrary.ts`) - a standardized index of the owner's uploaded documents (`building_documents`). Fineprint never re-keys the files; it gives the set one consistent cover.

Every export carries the shared envelope (`exportEnvelope.ts`: `schema_version`, `jurisdiction`, `building_identifiers`, standing dataset citations).

### Portfolio (many buildings, one owner)

`client/src/app/(main)/dashboard/portfolio/` subscribes to the owner's buildings/tasks/events and runs the pure engine client-side over every building row.
It computes per-building fines for all three periods and portfolio aggregates: total 2024-2029 and 2030-2034 exposure (and the "2030 cliff" ratio), total emissions, percent over caps, next deadline, and overdue tasks.
Panels rank buildings by 2030 fine (the prioritization view), list upcoming deadlines, and flag overdue/missing-data buildings.
Because the rollup runs the same deterministic engine, it never drifts from each building's own page.

### Analyzing customer profiles at scale

Every row is scoped by `owner`, which makes owner-level segmentation and cross-owner analysis a straight aggregation over `owner`-filtered rows:

- **`buildings`** is the richest surface: `sqft`, `is_affordable` (Article 320 vs 321 population), `annual_emissions_tco2e`, `uses_json` (occupancy mix), `ll97_covered`, `community_district` (geography), `energy_star_score` (efficiency tier), plus the two derived blobs.
- **Derived exposure** - `computeAllPeriods` over each building yields per-owner total exposure, the cliff ratio, over-cap tonnage, and missing-data counts.
- **Systems dossier** (`compliance_plan_json.personalization.systems`) - segment a book of business by "still burning oil," "failing boilers," "no solar," each with cited evidence and confidence.
- **Personalized measures** - per-building `costPerTco2eAvoided` / `capexUsd` / `estReductionTco2e` are the raw material for portfolio-level abatement supply curves and capital-plan sizing.
- **`obligations`** - a compliance-status funnel (open / settled / missing-evidence) per owner and law.
- **`evidence`** / **`building_documents`** - proof-coverage and document-freshness (expiring permits, evidence gaps, missing documents).
- **`tasks`** - operational throughput and SLA-breach rates.
- **`events`** / **`binder_events`** - timestamped lifecycle and engagement streams.

No re-derivation is needed: the exposure math is deterministic and the systems/measures/exposure are already denormalized onto the building row and its JSON blobs.

## Running and deploying

Root `package.json` scripts:

```
npm run dashboard        # next dev -p 3000 (client)
npm run supabase:push    # supabase db push  (apply migrations)
npm run supabase:types   # regenerate client/src/lib/supabase/types.ts from the linked DB
npm run trigger:dev      # run the agent task locally against Trigger.dev
npm run trigger:deploy   # deploy the agent task
npm run typecheck        # fan out across workspaces
npm run test             # fan out across workspaces
```

Typical local bring-up: `npm install` → `npx supabase link --project-ref <ref>` → `npm run supabase:push` → `npm run supabase:types` → `cd agents && npm run trigger:deploy` (or `trigger:dev`) → `npm run dashboard`.
Verify with `POST /api/tasks {"address":"…"}` and watch rows land in Supabase.

Environment variables (Next.js reads them from `client/.env.local`):

| Group | Vars |
| --- | --- |
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, the four `NEXT_PUBLIC_CLERK_*_URL` |
| Supabase (app) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `SUPABASE_JWT_SECRET` (server-only; must match the project or Realtime silently returns nothing) |
| Trigger.dev | `TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY` |
| Trigger.dev job env (in the Trigger dashboard) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `SOCRATA_APP_TOKEN` |
| Agent drafting | `USE_LLM` (default false), `ANTHROPIC_API_KEY` |
| NYC data | `SOCRATA_APP_TOKEN` (optional; raises rate limits) |

Note: the Supabase `NEXT_PUBLIC_SUPABASE_*` vars must be present in `client/.env.local` (not only the repo-root `.env.local`) or the client fails with "supabaseUrl is required" during build/prerender.

## Known drift and gotchas

- `README.md` / `CLAUDE.md` still describe SpacetimeDB as the backend (with `spacetime start`, `publish:local`, `worker`, `claim_task`, the reaper). Those commands and that runtime no longer exist. Supabase + Trigger.dev is live.
- `NEXT_PUBLIC_DATA_BACKEND` is vestigial - no runtime code reads it; the provider is hard-wired to Supabase.
- The law registry is now canonical in `data/laws.ts` (the client consumes it via the `fineprint-laws` alias), not in `spacetimedb/src/laws.ts` (which is gone). `CLAUDE.md` still says the latter.
- `data/src/intake.ts` emits `systemsJson` and `systemDeadlinesJson` in its ingest args, but the Supabase ingest path (`client/src/lib/supabase/ingest.ts`) persists neither as a column; the dossier is read from `compliance_plan_json.personalization.systems`, and `Building.systemsJson` is hardcoded `undefined`. `system_deadlines` rows exist in schema (0006) but nothing populates them through the current ingest.
- Nothing sets `tasks.sla_breached` yet - the migration's planned Trigger.dev scheduled sweep (which would also rescue stuck `running` runs) is not built.
- The migrations have not been verified against a live database per the migration doc; apply `0001…0006` and regenerate types before relying on them.
</content>

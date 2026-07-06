# Migration: SpacetimeDB to Supabase + Trigger.dev

This is the running guide for moving FinePrint's backend from SpacetimeDB to Supabase (Postgres, Realtime, Storage) with Trigger.dev running the agents.
Auth stays on Clerk.
The rollout is parallel: the new path is built alongside the working SpacetimeDB app and nothing switches until the `NEXT_PUBLIC_DATA_BACKEND` flag is flipped.

## Target architecture

```
Browser (Clerk session)
   |  Clerk JWT (sub = clerk user id)
   |--> Next.js route handlers (client/src/app/api/*) -- RLS writes --> Supabase Postgres
   |        |  tasks.trigger("intake-run")                                    ^        |
   |        v                                                                 |        v
   |    Trigger.dev cloud --> intake-run job (data/src pipeline) -- service-role writes
   |                                                                          |
   |--< Supabase Realtime (postgres_changes, RLS-scoped) <--------------------
Evidence uploads: browser --> Supabase Storage (evidence bucket) --> evidence.storage_path
```

## What is already built (this branch)

Backend and job scaffolding, all additive - the SpacetimeDB app is untouched and still runs.

- `supabase/migrations/0001_schema.sql` - the 10 owner-scoped tables (buildings, tasks, submissions, approvals, settings, events, vendors, obligations, evidence, binder_events). The worker/reaper tables are gone; Trigger.dev owns concurrency and retries.
- `supabase/migrations/0002_rls.sql` - row-level security keyed on the Clerk `sub` via `requesting_owner()`.
- `supabase/migrations/0003_functions.sql` - `log_event()` and the atomic `ingest_building()` RPC (service-role only).
- `supabase/migrations/0004_realtime_storage.sql` - Realtime publication + the private `evidence` storage bucket and its policies.
- `client/src/lib/supabase/` - browser, server, and admin clients; hand-authored `Database` types; the TS `ingest.ts` helper.
- `agents/trigger.config.ts` + `agents/src/trigger/intake-run.ts` - the agent as a Trigger.dev task (a port of `agents/src/worker.ts` runTask).
- `client/src/app/api/tasks/*` - the `request` / `approve` / `reject` routes that write to Postgres and fire the job.
- `client/src/components/supabase-provider.tsx` + `client/src/lib/data/*` - the Realtime provider, the `useRealtimeTable` hook, and the client mutation helpers (the Phase 3 seam).

## What you must provision (checklist)

Do these in order. Each line ends with the env var it fills.

- [ ] 1. Supabase project - https://supabase.com/dashboard -> New project.
      Project Settings -> API gives you: Project URL (`NEXT_PUBLIC_SUPABASE_URL`), anon/publishable key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), service_role key (`SUPABASE_SERVICE_ROLE_KEY`), and (Project Settings -> API -> JWT Keys -> "JWT Secret", the legacy HS256 secret) `SUPABASE_JWT_SECRET`.
- [ ] 2. Clerk auth - NO Clerk dashboard access required. The app already has the Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) so login works. The server mints a Supabase token from the Clerk session signed with `SUPABASE_JWT_SECRET` (see `client/src/app/api/supabase-token/route.ts` + `lib/supabase/token.ts`), so no Clerk<->Supabase integration toggle is needed.
- [ ] 3. Google sign-in - only possible if you can reach the Clerk dashboard (Social Connections -> Google, backed by a Google Cloud OAuth client). Without Clerk dashboard access, skip it - whatever sign-in methods Clerk already has keep working.
- [ ] 4. Trigger.dev project - https://cloud.trigger.dev -> new project.
      Put the project ref (`proj_...`) in `agents/trigger.config.ts` or `TRIGGER_PROJECT_REF`, and the secret key in `TRIGGER_SECRET_KEY` (read by the Next.js routes).
      In the Trigger.dev dashboard -> Environment Variables, set `SUPABASE_URL` (the same URL, no `NEXT_PUBLIC_` prefix), `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` (only if `USE_LLM=true`), and `SOCRATA_APP_TOKEN` (optional).

Put the app-side vars (1, 4) in `.env.local`.
See `.env.example` for the full list.

## Finish wiring (after provisioning)

```bash
npm install                                   # pulls @supabase/supabase-js and @trigger.dev/sdk

# 1. Apply the schema to your Supabase project
npx supabase link --project-ref <your-ref>
npm run supabase:push                         # runs everything in supabase/migrations

# 2. Regenerate the typed Database from the live schema (replaces the hand-authored types)
npm run supabase:types

# 3. Deploy the agent job
cd agents && npm run trigger:deploy           # or `npm run trigger:dev` for local runs

# 4. Verify the new path end-to-end while the dashboard still runs on SpacetimeDB:
#    POST /api/tasks {"address": "..."} -> watch the tasks/submissions rows land in Supabase.
```

## Security and data model (how writes are guarded)

- RLS splits into two shapes (`0002_rls.sql`). State-machine and audit tables (buildings, tasks, submissions, approvals, events) are owner READ-ONLY; every write to them goes through the service-role routes and the job, which validate transitions - a browser cannot flip a task to approved or edit the audit log. The compliance binder and settings (vendors, obligations, evidence, binder_events, settings) are owner full-CRUD, edited directly from the browser.
- The `ingest_building` and `log_event` functions are `revoke ... from anon, authenticated` and granted only to `service_role`. This is deliberate and load-bearing: revoking from `PUBLIC` alone does NOT remove Supabase's default role grants, so without the explicit revoke any signed-in user could inject rows into another account. If you regenerate or edit those functions, re-apply the revoke.
- The three routes use the service-role admin client and check `task.owner === userId` explicitly (the reducer model). Never move those writes to the browser.

## What remains (not yet built)

- Phase 3 - migrate the ~10 dashboard reader components from SpacetimeDB subscriptions to `useRealtimeTable`, and their reducer calls to `mutations.ts` (pipeline) / direct-RLS writes (binder). `useTasks.ts` is the worked example. Move evidence uploads to Supabase Storage (`evidence.storage_path`). Mount `<SupabaseProvider>` when `NEXT_PUBLIC_DATA_BACKEND === "supabase"`.
- Remaining mutations to port (no route/hook yet): `mark_done`, `set_review_mode`, manual `add_building`, and the binder writes (`add_vendor`, `assign_vendor`, `set_obligation_status`, `add_evidence`, `set_evidence_verification`, `add_binder_note`). The binder ones are direct RLS writes through the browser client; `mark_done`/`set_review_mode`/`add_building` should be routes like the three that exist.
- SLA + stuck-run sweep - the old 5s `reap` did two jobs: fail stale workers (now handled per-run by the job's `onFailure` hook) and set `tasks.sla_breached` when a deadline passes. Nothing sets `sla_breached` yet. Add a Trigger.dev scheduled task that flags overdue tasks and, as a backstop, marks any task stuck in `running` past a threshold as `failed` (covers a hard-killed run whose `onFailure` never ran).
- Phase 4 - flip the flag default to `supabase`, soak, then delete `spacetimedb/`, both `module_bindings/` dirs, `agents/src/worker.ts`, `spacetime-provider.tsx`, and the spacetime scripts in the root `package.json`.

## Risks and watch items

- Clerk role claim - handled: the self-signed Supabase token sets `role: "authenticated"` and `aud: "authenticated"` in `lib/supabase/token.ts`, which is what RLS-scoped Realtime (`postgres_changes`) requires. If Realtime returns nothing, verify the `SUPABASE_JWT_SECRET` matches the project (a wrong secret makes every token silently invalid).
- Deployed data assets - `trigger.config.ts` bundles `data/cbl/**` and `data/corpus/**` via `additionalFiles`. After the FIRST deploy, run one intake against a real address and confirm it resolves a building; if it returns an ENOENT failure report, the copied asset is not where `import.meta.url` resolves and the globs need adjusting. Local `trigger dev` will not catch this (it reads the real filesystem).
- Realtime auth - the browser client feeds the Clerk token to Realtime via the `accessToken` option; if a token rotates and the feed goes quiet, that is the place to look. `useRealtimeTable` re-syncs on reconnect.
- Two-system dispatch - the request route inserts the task then triggers with `idempotencyKey`, and marks the task `failed` if the trigger throws; a race-safe partial unique index enforces one live intake per (owner, address).
- Approve atomicity - building + obligation tasks are written by the single `ingest_building` RPC, not sequential inserts. Keep it that way.
- Audit invariant - every write path appends an `events` row; routes insert their own, the job calls `log_event`. Do not add a write path that skips it.
- Duplicate submissions on retry - the job's submit path is multiple statements and not transactional across Trigger retries, so a mid-write retry can leave two submissions for one task. Approve reads the latest, so correctness holds, but the review UI may show a dupe; a `run_id` upsert key would remove it.
- Migrations are unverified against a live database - they are written against the documented Postgres/Supabase behavior but have not been run. `supabase db push` will surface any issue on first apply.

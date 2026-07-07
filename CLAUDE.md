# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                  # workspaces: client, agents, engine, data, laws
npm run db:start             # local Supabase (Docker); prints URL + anon/service keys
npm run db:reset             # reapply supabase/migrations after any schema change
npm run worker               # one dispatcher process; WORKER_NAME=atlas npm run worker
npm run dashboard            # Next.js dev server, port 3001
npm run ingest -- "<addr>"   # resolve a real address and ingest it from the CLI
npm run typecheck            # all workspaces
npm test                     # all workspaces (vitest)
```

Inspect the database:

```bash
npx supabase db psql -c "SELECT id, status FROM task"
npx supabase db psql -c "SELECT kill_worker(1)"
npx supabase db psql -c "SELECT kind, payload FROM event ORDER BY id DESC LIMIT 20"
```

## Architecture

Supabase Postgres is the backend. No API server exists; do not add one. The
browser and the agent workers talk to the database directly: reads are
RLS-scoped selects kept live by Realtime, writes are SQL function calls (the
"reducers") — nothing else writes. The whole schema lives in one migration,
`supabase/migrations/20260706120000_init.sql`.

- Every function writes an `event` row (heartbeat deliberately excepted — it
  used to flood the log). Keep that invariant when adding functions.
- `claim_task` is the core guarantee: one atomic
  `UPDATE … WHERE status = 'open'` gives exactly one owner per task. Never
  enforce ownership client-side.
- `reap()` runs every 5s on pg_cron: stale heartbeat (15s) means the worker
  is marked dead and its task returns to open. It also prunes events older
  than 90 days.
- Identity: humans carry a Clerk JWT (Supabase third-party auth) and RLS
  scopes every table to `auth.jwt()->>'sub'` = the `owner` column. The
  worker fleet uses the service-role key, which bypasses RLS and is the only
  role the fleet functions accept. The review functions (`approve`,
  `reject`, `mark_done`, `set_review_mode`) refuse the service role — a
  human signs off, never an agent.
- Intake is approve-then-ingest: the worker resolves an address (geocode
  gate in `data/src/geosearch.ts` rejects wrong-street/wrong-borough
  matches via `fail_intake`) and submits the draft with a `payload_json`
  built by `data/src/ingestPayload.ts`; the building and its obligations are
  created inside `approve`. Rejecting an intake is terminal.
- The database cannot import the law registry, so callers compute task specs
  (`data/src/taskSpecs.ts`) and pass them into `add_building` /
  `ingest_building`, which validate the shape and insert atomically — the
  same boundary the engine's fine figures always crossed.
- The law registry is canonical in `data/src/laws.ts`; `data/laws.ts`
  re-exports it and the `laws/` workspace package (`fineprint-laws`) exposes
  it to the client.
- The client's data layer is `client/src/lib/db/` (provider, useTable /
  useReducer hooks, row mappers). Components consume camelCase rows with
  real `Date` fields; the mappers own the snake_case translation.
- Statuses are plain strings validated by CHECK constraints and functions:
  task `open | claimed | in_review | approved | rejected | done`,
  worker `idle | working | dead`.

## Code style

Optimize for readability above all: clear variable names, logical paragraph
spacing, code that reads as a sentence — in TypeScript and in SQL alike.

```sql
create or replace function claim_task(p_worker_id bigint, p_task_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  w worker%rowtype;
  claimed task%rowtype;
begin
  perform fp_require_service();

  select * into w from worker where id = p_worker_id;
  if not found then
    raise exception 'claim came from an unregistered worker';
  end if;

  update task
  set status = 'claimed', claimed_by = p_worker_id
  where id = p_task_id and status = 'open'
  returning * into claimed;

  if not found then
    raise exception 'task % was already claimed', p_task_id;
  end if;

  perform fp_log_event(claimed.owner, 'task_claimed', ...);
end;
$$;
```

The rules:

- Names carry the meaning. `claimingWorker`, `requestedTask` — never `w`, `t`,
  `tmp`, `data` in TypeScript. If a name needs a comment to explain it,
  rename it.
- Paragraph spacing. Blank line between each logical beat: fetch, validate,
  mutate, audit. The eye should find structure without reading.
- One thing per line. Multi-property updates stack vertically.
- Braces on every if. No one-line guards.
- Errors in human language: "task 4 was already claimed", not "invalid status".
- Comments are scarce and only explain a non-obvious why (a threshold, a
  workaround, an ordering constraint). Banned: banner and divider comments,
  comments restating the code, section headers inside functions, emoji,
  commented-out code, TODO without an owner.
- Formatting: Prettier owns the repo, Biome owns `client/` (`npx biome
format`), SQL is hand-formatted. Never argue with the formatters.
- Naming: SQL functions and columns are snake_case (these become RPC and API
  names); TypeScript is standard camelCase. The client's mappers translate
  at the boundary — components never see snake_case.
- No new dependencies without approval.
- Markdown: sentence-case headers, no emoji in headers.

## Commits

- Subject line under 90 characters, written in plain human language. Say what
  changed and why a reader would care: "add 2030 emission limits so projections
  cover the cliff", not "implement multi-period coefficient table integration".
- No buzzwords, no filler ("enhance", "leverage", "robust", "comprehensive").
  If the subject reads like a press release, rewrite it.
- Body only when the subject can't carry the why; wrap it like prose.

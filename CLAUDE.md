# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                  # workspaces: spacetimedb, client, agents
spacetime start --listen-addr 127.0.0.1:3011   # database; port 3000 belongs to the Next.js app
npm run publish:local        # build + publish module to local db 'fineprint'
npm run generate             # regenerate bindings — REQUIRED after any schema/reducer change
npm run seed                 # 5 buildings -> ~23 tasks (idempotent, skips if data exists)
npm run worker               # one agent process; WORKER_NAME=atlas npm run worker
npm run dashboard            # Next.js dev server, port 3000
npm run typecheck            # all workspaces
```

Inspect or reset the database:

```bash
spacetime sql  -s local fineprint "SELECT id, status FROM task"
spacetime call -s local fineprint add_building '"addr"' 80000 false
spacetime logs -s local fineprint
spacetime publish --module-path spacetimedb --server local fineprint -y --delete-data=always  # wipe data
```

## Architecture

SpacetimeDB is the backend. No API server exists; do not add one. The browser
and the agent workers open WebSockets directly to the database (port 3011).
Reads are table subscriptions, writes are reducer calls — nothing else writes.

- `spacetimedb/src/` is the module. `schema.ts` (tables) and `reducers.ts`
  import each other circularly on purpose: the scheduled table's
  `scheduled: (): any => reap` arrow is evaluated lazily. The re-export order
  in `index.ts` (`./reducers` before `./schema`) is what makes this safe —
  do not reorder it.
- Every reducer writes an `event` row. Keep that invariant when adding reducers.
- `claim_task` is the core guarantee: check-then-set inside one transaction
  gives exactly one owner per task. Never enforce ownership client-side.
- `reap` runs on a 5s schedule: stale heartbeat means the worker is marked
  dead and its task returns to open.
- `client/src/module_bindings/` and `agents/src/module_bindings/` are
  generated. Never hand-edit them; regenerate both with `npm run generate`.
- One worker process = one connection = one identity = one `worker` row.
  Reducers resolve the caller through a `ctx.sender` identity lookup.
- The law registry is canonical in `spacetimedb/src/laws.ts` (the module
  cannot import outside its own src/); `data/laws.ts` only re-exports it.
- Statuses are plain strings validated in reducers:
  task `open | claimed | in_review | approved | rejected | done`,
  worker `idle | working | dead`.

## Code style

Optimize for readability above all: clear variable names, logical paragraph
spacing, code that reads as a sentence.

```typescript
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

  logEvent(
    ctx,
    "task_claimed",
    `${claimingWorker.name} claimed "${requestedTask.title}"`,
    taskId,
    claimingWorker.id,
  );
});
```

The rules:

- Names carry the meaning. `claimingWorker`, `requestedTask` — never `w`, `t`,
  `tmp`, `data`. If a name needs a comment to explain it, rename it.
- Paragraph spacing. Blank line between each logical beat: fetch, validate,
  mutate, audit. The eye should find structure without reading.
- One thing per line. Multi-property updates stack vertically.
- Braces on every if. No one-line guards.
- Errors in human language: "task 4 was already claimed", not "invalid status".
- Comments are scarce and only explain a non-obvious why (a threshold, a
  workaround, an ordering constraint). Banned: banner and divider comments,
  comments restating the code, section headers inside functions, emoji,
  commented-out code, TODO without an owner.
- Formatting itself is Prettier's job (the on-save hook runs it). Never argue
  with it and never hand-align columns.
- Naming: reducers are snake_case (these become CLI and API names); everything
  else is standard TS camelCase. Snake_case table names become camelCase
  accessors (`reaper_tick` -> `ctx.db.reaperTick`).
- u64 columns are bigint in TS (`0n` for autoinc inserts). Don't mix number
  and bigint.
- No new dependencies without approval.
- Markdown: sentence-case headers, no emoji in headers.

## Commits

- Subject line under 90 characters, written in plain human language. Say what
  changed and why a reader would care: "add 2030 emission limits so projections
  cover the cliff", not "implement multi-period coefficient table integration".
- No buzzwords, no filler ("enhance", "leverage", "robust", "comprehensive").
  If the subject reads like a press release, rewrite it.
- Body only when the subject can't carry the why; wrap it like prose.

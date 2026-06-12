# fineprint

NYC buildings answer to a stack of local laws with real deadlines and real fines: LL97 emissions caps, LL11 facade inspections, LL84 benchmarking, and friends. fineprint runs that problem as a live ops room. Add a building and each obligation becomes a ticket with its statutory deadline on a timer. AI workers claim tickets, draft the remediation, and submit. You approve every one.

Kill a worker mid-ticket. Within 15 seconds the ticket is back in the queue and another worker has it. That recovery is the demo.

## One database, no server

The entire backend is one SpacetimeDB module (`spacetimedb/src/`). The React dashboard and the Node workers connect straight to the database over WebSocket. Reads are live subscriptions. Writes go through reducers, and each reducer appends to an `event` audit table.

The part worth stealing: `claim_task` runs check-then-set inside one transaction, so two workers racing for a ticket can't both win. The queue, the locks, the 5-second crash reaper, the audit log: zero infrastructure code, all rows and reducers.

```
react dashboard ─┐
phones           ┼──ws──► spacetimedb module (tables + reducers + scheduler)
node workers    ─┘
```

## Run it

```bash
curl -sSf https://install.spacetimedb.com | sh   # CLI, once
npm install
spacetime start --listen-addr 127.0.0.1:3011     # terminal 1, keep open
npm run publish:local
WORKER_NAME=atlas npm run worker                  # terminal 2, repeat for a fleet
npm run dashboard                                 # terminal 3, port 3000
```

The database must listen on 3011 — port 3000 belongs to the Next.js dashboard,
and both the dashboard and the workers expect `ws://localhost:3011` by default.

The dashboard also needs Clerk auth keys in `client/.env.local` (Next.js reads
env files from `client/`, not the repo root):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

Add a building from the dashboard's address bar, or from the CLI:

```bash
spacetime call -s local fineprint request_building '"345 Park Avenue, Manhattan"'
```

After any schema or reducer change, `npm run sync` republishes the module and
regenerates the bindings for both the client and the agents.

## Poke it from the CLI

```bash
spacetime sql  -s local fineprint "SELECT id, status, title FROM task"
spacetime call -s local fineprint kill_worker 1
spacetime logs -s local fineprint
```

## Where it stands

Module, workers, and the Next.js dashboard all run today. `scripts/demo-kill.md` has the 90-second demo script, including a CLI fallback that needs no frontend.

Workers draft from canned playbooks by default. Set `USE_LLM=true` plus an `ANTHROPIC_API_KEY` to let Claude write the drafts instead; without a key everything still works.

## Honest numbers

Fine estimates come from stub formulas in `spacetimedb/src/laws.ts`, written from public disclosure data. Real filings need a registered design professional. The AI drafts. A human signs off on everything.

## Next

Real address lookup (NYC GeoSearch, LL84 and DOB datasets) so a street address spawns its actual obligations. After that: rebate matching and a portfolio view.

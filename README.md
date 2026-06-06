# Fineprint

**A live compliance ops room for NYC buildings, where AI agents work the queue and humans approve every move.**

NYC buildings face a dozen laws with real deadlines and real fines: LL97 emissions caps, LL11 facade inspections, LL84 benchmarking, and more. Fineprint turns each obligation into a live ticket with its statutory deadline as an SLA timer, and a fleet of AI workers claims them, drafts the remediation or fine analysis, and submits for human approval. Exactly one worker owns a ticket at any moment, a crashed worker's tickets heal back into the queue automatically, and every human watching the board sees the same state at the same instant.

## Why SpacetimeDB is load-bearing

| Need                                 | How SpacetimeDB does it                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Two agents race to claim one ticket  | `claim_task` reducer: check-then-set runs in one transaction. One commits, the other fails cleanly.              |
| Live board for everyone at once      | Public tables + client subscriptions. Phones, dashboards, and workers all see the same rows.                     |
| Crash recovery                       | Scheduled `reap` reducer fires every 5s inside the database. Stale heartbeat → worker dead, ticket back to open. |
| Audit trail                          | Append-only `event` table. Every reducer writes a row. No silent mutations.                                      |
| Scheduling, queue, auth tokens, sync | All the module. There is no other process.                                                                       |

Remove SpacetimeDB and this project stops existing — there is no other server.

## The market gap

Durable execution (Temporal, $300M Series D, Feb 2026) protects one workflow from crashing. Nothing coordinates many agents contending for shared, irreversible tasks with a human approver inside the same live state. That coordination problem — mutual exclusion, crash recovery, live human oversight, audit — is exactly what a transactional realtime database gives you for free. That's this.

## Architecture

```
                      ┌──────────────────────────────┐
                      │   SpacetimeDB module (TS)    │
                      │                              │
   React dashboard ⇄  │  tables: building, task,     │  ⇄  agent worker #1 (Node)
   (judges' phones) ⇄ │  worker, submission,         │  ⇄  agent worker #2
                      │  approval, event             │  ⇄  agent worker #N
                      │                              │
                      │  reducers: claim_task,       │
                      │  submit_work, approve, ...   │
                      │  scheduled: reap (5s)        │
                      └──────────────────────────────┘
```

One database. Clients subscribe; reducers are the only writes; the reaper is a scheduled reducer inside the same module.

## Tech stack

- **SpacetimeDB 2.4** — database and entire backend (TypeScript module: tables, reducers, scheduled reducers)
- **TypeScript end to end** — module, agents, client
- **React 18 + Vite** — dashboard
- **Tailwind CSS v4** — styling
- **shadcn-style primitives** — button, card, badge
- **Framer Motion** — board animations (planned, M6)
- **lucide-react** — icons
- **Node.js 20+** — agent worker runtime
- **Anthropic SDK (Claude)** — agent drafting behind `USE_LLM` flag; scripted fallback is the default
- **NYC Open Data (Socrata SODA), NYC GeoSearch, DOB datasets** — building data (P1; seeded JSON for P0, see `data/nyc-apis.md`)
- **spacetimedb/react hooks** — `useTable`, `useReducer`

## Template status

| Milestone                                            | State                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| M1 module publishes, reducers callable via CLI       | ✅ verified                                                               |
| M2 seed script: 5 buildings → 23 obligations         | ✅ verified                                                               |
| M3 scripted agent claims and submits via Node client | ✅ written, smoke test pending                                            |
| M4 dashboard                                         | 🚧 shell only — `client/src/App.tsx` and board components not written yet |
| M5 reaper + kill demo                                | module side ✅; needs M4 for the button                                   |
| M6 LLM flag, motion polish, SLA timers               | LLM policy written; rest open                                             |

## Quickstart

```bash
# 0. Install the CLI (once)
curl -sSf https://install.spacetimedb.com | sh

# 1. Install deps
npm install

# 2. Start a local SpacetimeDB (own terminal, keep running)
spacetime start

# 3. Publish the module
npm run publish:local

# 4. Regenerate client bindings after any schema change
npm run generate

# 5. Seed 5 buildings → obligations spawn
npm run seed

# 6. Start agent workers (one per terminal, as many as you like)
npm run worker

# 7. Dashboard (after M4 lands)
npm run dashboard
```

CLI smoke tests, no client needed:

```bash
spacetime sql  -s local fineprint "SELECT id, lawId, status, title FROM task"
spacetime call -s local fineprint add_building '"21 W 4th St, Manhattan"' 80000 false
spacetime call -s local fineprint claim_task 1        # fails unless caller is a registered idle worker — that's the guarantee
spacetime sql  -s local fineprint "SELECT kind, payload FROM event"
spacetime logs -s local fineprint
```

## Demo runbook

The 90-second script lives in [`scripts/demo-kill.md`](scripts/demo-kill.md). Short version: seed buildings, watch three agents drain the queue, kill one mid-ticket, watch the reaper return its ticket to open and another agent pick it up, then approve the draft from a phone.

## Honesty footnote

Fine figures are estimates derived from public disclosure data and stub formulas in `spacetimedb/src/laws.ts`. Official compliance filings require a registered design professional. The AI drafts; humans approve everything.

## Roadmap

- **P1** — real NYC address lookup (GeoSearch → BBL → LL84/DOB datasets) spawning real tickets with real cycle deadlines
- **P2** — rebate matching, Article 321 routing, portfolio view across buildings

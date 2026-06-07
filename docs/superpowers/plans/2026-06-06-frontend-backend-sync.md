# Frontend-backend sync implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One main branch holding the full backend (engine, data, agents, board) and the Next.js dashboard, with the dashboard reading live board state and writing through reducers — request a building, approve/reject drafts.

**Architecture:** The dashboard already does the right thing for reads: `spacetime-provider.tsx` opens a browser WebSocket via `spacetimedb/react` and subscribes to all tables; `proxy.ts` is Clerk middleware, not an API server, so the no-API-server rule holds. What's missing is the merge (dashboard-ui branched before the data layer landed) and every write path. The engine being pure TS means the client can also run `optimizeRetrofit` locally for the building page.

**Tech stack:** existing — Next.js App Router, Clerk, shadcn/ui, spacetimedb/react, fineprint-engine workspace import.

---

## Phase M — merge (user runs git, Claude resolves)

State: local main behind origin; ai-agents (bfe3432) descends from origin/main → fast-forward. dashboard-ui (bc6ce98) branched from pre-data main → real merge with known conflicts.

- [ ] M1: `git checkout main && git pull` → main at origin/main
- [ ] M2: `git merge ai-agents` → fast-forward, no conflicts
- [ ] M3: `git merge dashboard-ui --no-commit` → stops on conflicts:
  - `package.json` — union: keep `reviewer` script AND `data` workspace
  - `package-lock.json` — take either, then `npm install` regenerates
  - `agents/package.json` — union: `reviewer` + `test`/`test:watch` + vitest devDep
  - `agents/src/policies/types.ts` — take ai-agents (rich DraftInput); their flat variant is subsumed
  - `agents/src/policies/llm.ts` — take ai-agents (tool loop + cache); fold their per-law SYSTEM_PROMPTS as kind-specific framing lines in `taskBrief` (preserves their work without losing the no-arithmetic loop)
  - `agents/src/worker.ts` — take ai-agents (intake dispatch); restore their `WORKER_KINDS` env filter block
- [ ] M4: evict tracked build junk dashboard-ui carries: `git rm -r --cached client/.next client/.agents client/next-env.d.ts` (already gitignored)
- [ ] M5: `npm install` (lockfile), commit the merge, push

## Phase W — wire (regenerate, compile, fix)

- [ ] W1: `npm run publish:local` then `npm run generate` — client bindings gain `requestBuilding`, `ingestBuilding`, new building columns; agents bindings refresh
- [ ] W2: `npm run typecheck` all workspaces; fix what the merge broke (their `reviewer.ts` imports `module_bindings/types` — verify against fresh codegen)
- [ ] W3: `cd client && npm run build` — Next.js production build green

## Phase C — connect (the missing write paths + new read surfaces)

- [ ] C1: **Request-a-building form.** Portfolio (or dashboard home) gets an address input calling `conn.reducers.requestBuilding({ address })`. Disabled state while pending; the new intake task then streams in via the existing task subscription. This is the demo's front door.
- [ ] C2: **Approve / reject on tasks.** `tasks-client.tsx` rows with status `in_review` get Approve / Reject buttons (shadcn Button + a note dialog) calling `conn.reducers.approve({ taskId, note })` / `reject`. The human gate moves from CLI to UI.
- [ ] C3: **Retrofit on the building page.** `lib/engine.ts` gains `computeRetrofit(building)` wrapping `optimizeRetrofit` (same null-guard as `computePeriods`); `building-client.tsx` shows the cheapest path with the assumptions disclaimer, or nothing when do-nothing wins.
- [ ] C4: **Kill-worker demo button.** Agents page row action calling `conn.reducers.killWorker({ workerId })` — the crash-heal story, clickable.

Each C task: match existing dashboard conventions (shadcn components, their card/table patterns), every state designed (pending, error toast, empty), no new dependencies.

## Phase V — verify

- [ ] V1: typecheck + all suites + client build
- [ ] V2: live browser pass: sign in → request a real address → watch tickets appear → worker drafts → approve one, reject one → building page shows fines + retrofit → kill a worker, watch the board heal
- [ ] V3: user commits and pushes main

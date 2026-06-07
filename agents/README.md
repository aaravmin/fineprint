# Fineprint agents

Worker processes that drain the compliance task queue. Each process opens one
WebSocket to SpacetimeDB, registers as one `worker` row, and loops:
subscribe → claim → draft → submit for review. Run a fleet by starting more
terminals:

```bash
npm run worker                          # default name agent-<pid>
WORKER_NAME=atlas npm run worker        # named
USE_LLM=true npm run worker             # LLM drafting (needs ANTHROPIC_API_KEY)
```

Coordination lives entirely in reducers, never in the worker. `claim_task`
is a check-then-set inside one transaction, so two workers racing on the
same task means one wins and the other's call throws — that loss is caught
and ignored. A worker that stops heartbeating for 15s is reaped server-side:
marked dead, its task returned to open for the next worker. Kill a worker
mid-draft and watch the board heal.

## What a worker does with a task

Two task kinds:

- **`building_intake`** — the task carries an address, not a building. The
  worker runs the data pipeline (`prepareIntake`: GeoSearch → LL84 → Covered
  Buildings List → engine fines), calls the `ingest_building` reducer — which
  upserts the building row and spawns its real obligations as new tasks —
  and submits the intake summary for review. A failed lookup becomes an
  honest failure report, never a stuck task.
- **everything else** — a compliance obligation. The worker builds a
  `DraftInput` from the task + building rows (`draftInput.ts` parses the
  JSON columns; corrupt JSON degrades to empty, never crashes), drafts a
  plan, and submits it. The task lands `in_review` for a human verdict.

## Drafting policies

`policies/scripted.ts` is the default and needs no keys: one template per
task kind, the engine's three-period fine projection spliced in when the
building has emissions and use data, deadline line, and a sources footnote
straight from the ingest provenance.

`policies/llm.ts` runs when `USE_LLM=true` and `ANTHROPIC_API_KEY` is set.
It is a tool-use loop, not a single prompt: the model pulls building facts
and fine numbers through the data package's `assess_building` /
`lookup_building` tools, so every dollar figure in a draft is an engine
output the model quoted, never model arithmetic. Six tool rounds max; any
error falls back to the scripted policy — the demo never stalls on an API.
Model: `claude-haiku-4-5` (cheap fleet drafting), override with
`ANTHROPIC_MODEL`.

`projections.ts` is the only bridge to the engine: `DraftInput` →
`computeAllPeriods` → rendered cliff table, plus `projectRetrofit` → the
optimizer's cheapest measure combination (capex assumptions disclosed, never
quotes). Buildings without the data get neither — numbers are omitted, not
invented. When doing nothing beats every retrofit combo (big efficient
buildings), the draft says nothing rather than pitching a bad spend.

## Ask and advise

Two CLIs round out the AI layer; both keep every number on the engine's side
of the line:

```bash
npx tsx agents/scripts/ask.ts "what is the penalty per ton over the limit?"
npx tsx agents/scripts/advise.ts "350 5th Avenue, Manhattan"
```

`ask.ts` answers law questions through the `ask_law` data tool — BM25
retrieval over source-verified LL97 statute and rule chunks, citations
inline, refusal when the corpus has nothing. `advise.ts`
(`src/ai/advise.ts`) turns a full `assess_building` result into a one-page
owner summary; the model quotes the assessment verbatim and is forbidden to
total or extrapolate.

## Offline demo caches

Successful LLM drafts are written to `agents/cache/llm/` and replayed (with
a `[cached]` marker) when the API is down, before degrading to the scripted
policy. The data layer keeps the same bargain: live GeoSearch and LL84
responses leave snapshots under `data/cache/` and a dead network serves the
snapshot with a warning.

## Testing

```bash
npm test --workspace agents             # 28 tests, offline
RUN_INTEGRATION=1 npm test --workspace agents   # + live intake against a running server
```

The LLM loop is tested with a fake `createMessage`/`executeTool` pair
(`LlmDeps`), so tool-round behavior, error surfacing, and the empty-draft
guard run without the SDK or a key.

## Environment

| Variable                  | Default               | Meaning                                                           |
| ------------------------- | --------------------- | ----------------------------------------------------------------- |
| `SPACETIME_URI`           | `ws://localhost:3011` | database WebSocket                                                |
| `DB_NAME`                 | `fineprint`           | module name                                                       |
| `WORKER_NAME`             | `agent-<pid>`         | name on the board                                                 |
| `USE_LLM`                 | unset (scripted)      | `true` enables the tool loop                                      |
| `ANTHROPIC_API_KEY`       | —                     | required when `USE_LLM=true`                                      |
| `ANTHROPIC_MODEL`         | `claude-haiku-4-5`    | drafting model override (advise/ask default to `claude-opus-4-8`) |
| `FINEPRINT_LLM_CACHE_DIR` | `agents/cache/llm`    | replayable draft location                                         |
| `FINEPRINT_CACHE_DIR`     | `data/cache`          | data snapshot location                                            |

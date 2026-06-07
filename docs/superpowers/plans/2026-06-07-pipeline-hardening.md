# Pipeline Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buildings only exist after a human approves a confidence-gated intake; the queue can't dead-end silently; schema and bindings can't drift.

**Architecture:** The worker stops calling `ingest_building` directly. It resolves the address, gates on GeoSearch confidence (auto-reject via a new `fail_intake` reducer), and submits the draft with the ready-to-ingest args riding along as `payloadJson`. The `approve` reducer detects intake tasks and runs the shared ingest logic inside the approval transaction. Rejecting an intake is terminal, not requeue. Workers are barred from approving. A client banner warns when no agent is alive. One `npm run sync` script keeps module + bindings atomic.

**Tech Stack:** SpacetimeDB TS module, Node agent (tsx), Next.js 16 client, vitest (data + agents workspaces).

---

### Task 1: Geocode confidence gate (data layer)

**Files:**

- Modify: `data/src/types.ts:15-20` (BblResult)
- Modify: `data/src/geosearch.ts` (parse confidence/match_type, add `assessGeocode`, add `GeocodeRejectionError`)
- Modify: `data/src/lookup.ts:268-294` (`resolveBbl` applies the gate)
- Test: `data/tests/geosearch.test.ts`, `data/tests/lookup.test.ts`

- [ ] **Step 1: Write failing tests for confidence parsing + gate**

In `data/tests/geosearch.test.ts` add:

```typescript
import { assessGeocode, parseBblCandidates } from "../src/geosearch.ts";

const fallbackFeature = {
  properties: {
    label: "999 54 STREET, Brooklyn, NY, USA",
    borough: "Brooklyn",
    confidence: 0.6,
    match_type: "fallback",
    addendum: { pad: { bbl: "3056660020", bin: "3138062" } },
  },
};

const exactFeature = {
  properties: {
    label: "345 PARK AVENUE, New York, NY, USA",
    borough: "Manhattan",
    confidence: 1,
    match_type: "exact",
    addendum: { pad: { bbl: "1013060001", bin: "1035862" } },
  },
};

test("candidates carry confidence and match type", () => {
  const [candidate] = parseBblCandidates({ features: [exactFeature] }, "345 Park Ave");
  expect(candidate.confidence).toBe(1);
  expect(candidate.matchType).toBe("exact");
});

test("a fallback match is rejected with a human reason", () => {
  const [candidate] = parseBblCandidates(
    { features: [fallbackFeature] },
    "999 Nowhere Street, Atlantis",
  );
  const verdict = assessGeocode("999 Nowhere Street, Atlantis", candidate);
  expect(verdict.ok).toBe(false);
  expect(verdict.reason).toMatch(/fallback/i);
});

test("an exact match passes the gate", () => {
  const [candidate] = parseBblCandidates(
    { features: [exactFeature] },
    "345 Park Avenue, Manhattan",
  );
  expect(assessGeocode("345 Park Avenue, Manhattan", candidate).ok).toBe(true);
});

test("low confidence fails even without fallback match type", () => {
  const feature = {
    properties: {
      ...exactFeature.properties,
      confidence: 0.4,
      match_type: "interpolated",
    },
  };
  const [candidate] = parseBblCandidates({ features: [feature] }, "x");
  expect(assessGeocode("x", candidate).ok).toBe(false);
});
```

- [ ] **Step 2: Run, confirm FAIL** — `npm test --workspace data` → `assessGeocode` not exported, `confidence` undefined.

- [ ] **Step 3: Implement**

`data/src/types.ts` — extend BblResult:

```typescript
export interface BblResult {
  bbl: Bbl;
  bin: Bin | null;
  normalizedAddress: string;
  borough: string;
  // Pelias match quality: confidence 0..1 and match_type
  // ("exact" | "interpolated" | "fallback"). Null when absent.
  confidence: number | null;
  matchType: string | null;
}
```

`data/src/geosearch.ts` — parse the two fields in both parsers (`confidence: feature.properties.confidence ?? null`, `matchType: feature.properties.match_type ?? null`, extend the response interface), then add:

```typescript
const MIN_GEOCODE_CONFIDENCE = 0.7;

export class GeocodeRejectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodeRejectionError";
  }
}

// The Atlantis guard: Pelias happily "matches" garbage by falling back to a
// borough or street centroid. A fallback match or a low-confidence score
// means the lot on file is not the address the user typed.
export function assessGeocode(
  queriedAddress: string,
  chosen: BblResult,
): { ok: boolean; reason?: string } {
  if (chosen.matchType === "fallback") {
    return {
      ok: false,
      reason: `GeoSearch could not find "${queriedAddress}" and fell back to "${chosen.normalizedAddress}" — not the same place.`,
    };
  }
  if (chosen.confidence !== null && chosen.confidence < MIN_GEOCODE_CONFIDENCE) {
    return {
      ok: false,
      reason: `GeoSearch matched "${queriedAddress}" to "${chosen.normalizedAddress}" with low confidence (${chosen.confidence}).`,
    };
  }
  return { ok: true };
}
```

`data/src/lookup.ts` `resolveBbl` — after `const chosen = knownToDof ?? candidates[0];` add (DOF corroboration counts as verification, so only gate the uncorroborated path):

```typescript
if (!knownToDof) {
  const verdict = assessGeocode(address, chosen);
  if (!verdict.ok) {
    throw new GeocodeRejectionError(verdict.reason!);
  }
}
```

with imports `import { assessGeocode, GeocodeRejectionError, lookupBblCandidates as realLookupBblCandidates } from "./geosearch.ts";`

- [ ] **Step 4: Run data tests, fix any fixture fallout** (existing lookup.test.ts fixtures gain `confidence: 1, matchType: "exact"` or `null`s as needed). Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "reject fallback and low-confidence geocodes so garbage addresses can't become buildings"`

### Task 2: Module — approve-then-ingest

**Files:**

- Modify: `spacetimedb/src/schema.ts:64-73` (submission += payloadJson)
- Modify: `spacetimedb/src/reducers.ts` (submit_work arg, shared ingest fn, approve ingests, reject terminal for intake, new fail_intake, request_building guard, worker-can't-review guard)
- Modify: `package.json` (sync script — needed now to publish + regenerate atomically)

- [ ] **Step 1: schema** — submission gains `payloadJson: t.option(t.string())` after `body`.

- [ ] **Step 2: reducers**
  - Extract everything inside `ingest_building`'s handler into `function ingestFromArgs(ctx: any, args: IngestArgs)`; the reducer becomes a thin wrapper. Define `interface IngestArgs` matching the reducer arg shape.
  - `submit_work` args += `payloadJson: t.option(t.string())`; insert stores it.
  - `approve`: guard `if (workerBySender(ctx)) throw new Error("workers cannot approve drafts");`. After the in_review check, if `task.kind === "building_intake"`: find latest submission for the task (`[...ctx.db.submission.iter()].filter(s => s.taskId === taskId).sort((a, b) => (a.id > b.id ? -1 : 1))[0]`), require `payloadJson`, `ingestFromArgs(ctx, JSON.parse(payloadJson))`, log `intake_approved` event mentioning the ingest.
  - `reject`: same worker guard; for intake kind set status `"rejected"` (terminal) with note, not `"open"`.
  - New `fail_intake` reducer `{ taskId: t.u64(), reason: t.string() }`: sender must be the claiming worker (same checks as submit_work), inserts a submission whose body is the failure report, sets task status `"rejected"`, frees the worker to idle, logs `intake_failed`.
  - `request_building` alreadyQueued statuses: `open | claimed | in_review`.

- [ ] **Step 3: sync script** — package.json scripts += `"sync": "spacetime publish --module-path spacetimedb --server local fineprint -y && npm run generate"`. Run `npm run sync`. Expected: publish OK, bindings regenerate with new `payloadJson` + `failIntake`.

- [ ] **Step 4: typecheck + commit**

### Task 3: Worker — gate, fail, or submit with payload

**Files:**

- Modify: `agents/src/worker.ts:84-140`

- [ ] **Step 1:** `workOn` for intake: `intakeBuilding` now returns `{ body, payloadJson?: string } | { failed: reason }`-style result; on geocode rejection (`error.name === "GeocodeRejectionError"`) call `conn.reducers.failIntake({ taskId, reason })` instead of submitting; on success call `submitWork({ taskId, body: intake.summary, payloadJson: JSON.stringify(intake.ingestArgs) })`; **no `ingestBuilding` call**. Other failures keep the honest-report submit path (payloadJson undefined → approve will refuse, reject is the way out).
- [ ] **Step 2:** non-intake submits pass `payloadJson: undefined`.
- [ ] **Step 3:** `npm test --workspace agents`, typecheck, commit.

### Task 4: No-agent banner (client)

**Files:**

- Create: `client/src/components/agent-status-banner.tsx`
- Modify: `client/src/app/(main)/dashboard/layout.tsx` (mount above `{children}`)

- [ ] **Step 1:** Client component: `useTable(tables.worker)`; alive = status !== "dead". When zero alive, render a slim destructive-subtle banner: "No agents online — queued work will wait until a worker connects (`npm run worker`)." Render nothing otherwise.
- [ ] **Step 2:** Mount inside the layout's content area above `{children}`. Typecheck, commit.

### Task 5: Live end-to-end verification

- [ ] Wipe: `spacetime publish ... --delete-data=always`; start one worker.
- [ ] Good address via CLI `request_building` → task lands `in_review` with payload; **no building row yet**; approve from a non-worker identity → building + obligations appear.
- [ ] `request_building '"999 Nowhere Street, Atlantis"'` → task auto-rejected with geocode reason; **no building row**.
- [ ] Re-queue the good address while in_review → reducer refuses.
- [ ] Approve attempt while a worker row matches sender → refused (run approve from the worker's own connection is impractical via CLI; verified by code review + reducer unit logic).
- [ ] Banner: stop worker, dead-reap in ≤15s, dashboard shows banner.

### Task 6: Docs

- [ ] CLAUDE.md commands: add `npm run sync` line ("publish + regenerate bindings — use after any schema/reducer change"); note approve-then-ingest flow in architecture section (intake spawns building only on approval). Commit.

**Auth follow-up (documented, not built):** real reviewer auth = SpacetimeDB OIDC (Clerk token → `ctx.sender` claims). Today's slice only bars registered workers from approve/reject.

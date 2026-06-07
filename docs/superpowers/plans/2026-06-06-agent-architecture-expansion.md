# Agent architecture expansion implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the four missing pieces of the agent-architecture doc on the SpacetimeDB substrate: a retrofit optimizer (MACC + TCO), an AI board-summary narrator, an offline RAG over LL97 law text, two new law agents (LL152, LL55), and offline demo caches.

**Architecture:** Everything new follows the existing trust split — the engine computes every number (the optimizer lives there, pure and enumerated), the data package owns sources and tools (RAG corpus + retrieval are data tools), and the agents layer only narrates. The ticket board, lease claims, watchdog, and human gate already exist in SpacetimeDB and are untouched except for two new law registry entries.

**Tech stack:** TypeScript everywhere, vitest, zero new dependencies (BM25 is ~60 lines of plain TS), Anthropic SDK already present in agents.

---

## File structure

```
engine/src/retrofit.ts            NEW   measure catalog, subset enumeration, MACC, TCO
engine/tests/retrofit.test.ts     NEW
data/src/bm25.ts                  NEW   pure BM25 ranking
data/src/ask.ts                   NEW   corpus load + retrieveLawChunks
data/corpus/ll97.json             NEW   curated, source-verified law chunks
data/src/tools.ts                 MOD   assess_building gains retrofit; new ask_law tool
data/src/http.ts                  MOD   cachedFetchJson (live-then-cache fallback)
data/src/cache.ts                 NEW   snapshot read/write under data/cache/
data/src/geosearch.ts             MOD   use cachedFetchJson
data/src/ll84.ts                  MOD   use cachedFetchJson
data/tests/{retrofit via engine, bm25, ask, cache, laws}.test.ts  NEW/MOD
spacetimedb/src/laws.ts           MOD   ll152 + ll55 entries
data/src/intake.ts                MOD   coveredLawIds gains ll152/ll55
agents/src/projections.ts         MOD   projectRetrofit + renderRetrofitLines
agents/src/policies/scripted.ts   MOD   retrofit lines in LL97 template; 2 new templates
agents/src/policies/llm.ts        MOD   widen tool input type; LLM draft cache
agents/src/ai/advise.ts           NEW   board-summary narration (generative only)
agents/scripts/advise.ts          NEW   CLI: address -> board summary
agents/scripts/ask.ts             NEW   CLI: question -> cited answer
agents/tests/{retrofit_lines, advise, llm_cache}.test.ts          NEW/MOD
```

One commit per phase. The engineer runs `npx vitest run` in the workspace under test after every RED and GREEN step.

---

## Phase A — Retrofit optimizer (engine)

### Task A1: optimizer core

**Files:**

- Create: `engine/src/retrofit.ts`
- Test: `engine/tests/retrofit.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, test } from "vitest";
import { DEFAULT_MEASURES, optimizeRetrofit } from "../src/retrofit.ts";
import type { BuildingInput } from "../src/index.ts";

// Big office over its 2030/2035 caps; concrete numbers come from the engine,
// the assertions here check the optimizer's selection logic.
const overCapOffice: BuildingInput = {
  grossFloorAreaSqft: 100_000,
  occupancyGroups: [{ group: "Office", sqft: 100_000 }],
  annualEmissionsTco2e: 1_500,
};

const wellUnderCap: BuildingInput = {
  ...overCapOffice,
  annualEmissionsTco2e: 1,
};

describe("optimizeRetrofit", () => {
  test("a compliant building's cheapest plan is to do nothing", () => {
    const assessment = optimizeRetrofit(wellUnderCap);
    expect(assessment.best.measureIds).toEqual([]);
    expect(assessment.best.totalCostUsd).toBe(0);
  });

  test("a free measure that cuts emissions is always taken when fines exist", () => {
    const freeMeasure = [
      {
        id: "free",
        name: "free fix",
        capexUsdPerSqft: 0,
        emissionsReductionFraction: 0.5,
        basis: "test",
      },
    ];
    const assessment = optimizeRetrofit(overCapOffice, freeMeasure);
    expect(assessment.best.measureIds).toContain("free");
  });

  test("the best plan never costs more than doing nothing", () => {
    const assessment = optimizeRetrofit(overCapOffice);
    expect(assessment.best.totalCostUsd).toBeLessThanOrEqual(
      assessment.doNothing.totalCostUsd,
    );
  });

  test("enumerates every subset of the default catalog", () => {
    const assessment = optimizeRetrofit(overCapOffice);
    expect(assessment.evaluatedSubsets).toBe(2 ** DEFAULT_MEASURES.length);
  });

  test("MACC point arithmetic is exact and the curve is sorted ascending", () => {
    const catalog = [
      {
        id: "cheap",
        name: "cheap",
        capexUsdPerSqft: 1,
        emissionsReductionFraction: 0.1,
        basis: "test",
      },
      {
        id: "dear",
        name: "dear",
        capexUsdPerSqft: 10,
        emissionsReductionFraction: 0.1,
        basis: "test",
      },
    ];
    const { macc } = optimizeRetrofit(
      { ...overCapOffice, annualEmissionsTco2e: 1_000 },
      catalog,
    );

    // capex 100k over (1000 * 0.1 = 100 tCO2e/yr * 16 horizon years) = $62.50/tCO2e
    expect(macc[0]).toMatchObject({ measureId: "cheap", usdPerTco2e: 62.5 });
    expect(macc[1].usdPerTco2e).toBe(625);
  });

  test("combined reductions are multiplicative, never additive", () => {
    const catalog = [
      {
        id: "a",
        name: "a",
        capexUsdPerSqft: 0,
        emissionsReductionFraction: 0.5,
        basis: "t",
      },
      {
        id: "b",
        name: "b",
        capexUsdPerSqft: 0,
        emissionsReductionFraction: 0.5,
        basis: "t",
      },
    ];
    const { best } = optimizeRetrofit(overCapOffice, catalog);
    // 1500 * 0.5 * 0.5 = 375, not 1500 - 750 - 750 = 0
    expect(best.projectedEmissionsTco2e).toBe(375);
  });

  test("rejects a catalog too large to enumerate", () => {
    const big = Array.from({ length: 13 }, (_, i) => ({
      id: `m${i}`,
      name: `m${i}`,
      capexUsdPerSqft: 1,
      emissionsReductionFraction: 0.01,
      basis: "t",
    }));
    expect(() => optimizeRetrofit(overCapOffice, big)).toThrow(/catalog/);
  });

  test("Article 321 buildings get a disclosure note", () => {
    const assessment = optimizeRetrofit({ ...overCapOffice, isArticle321: true });
    expect(assessment.notes.join(" ")).toMatch(/Article 321/);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd engine && npx vitest run tests/retrofit.test.ts` — expect "Cannot find module '../src/retrofit.ts'"

- [ ] **Step 3: Implement `engine/src/retrofit.ts`**

```typescript
// Retrofit optimizer: exact enumeration over measure subsets, a marginal
// abatement cost curve, and total-cost minimization against LL97 fines.
// Pure — every dollar of fines comes from computeFine; this module adds only
// capex arithmetic and subset enumeration. Capex and savings figures are
// editorial assumptions for typical NYC buildings, never quotes, and every
// consumer is expected to say so.

import {
  computeFine,
  type BuildingInput,
  type FineResult,
  type Period,
} from "./index.ts";

export interface RetrofitMeasure {
  id: string;
  name: string;
  capexUsdPerSqft: number;
  emissionsReductionFraction: number; // of current emissions, multiplicative
  basis: string; // where the assumption comes from
}

export const DEFAULT_MEASURES: RetrofitMeasure[] = [
  {
    id: "hvac_controls",
    name: "BMS scheduling and controls optimization",
    capexUsdPerSqft: 1.0,
    emissionsReductionFraction: 0.06,
    basis: "NYSERDA real-time energy management program typical savings",
  },
  {
    id: "led_lighting",
    name: "LED lighting completion",
    capexUsdPerSqft: 2.5,
    emissionsReductionFraction: 0.08,
    basis: "DOE solid-state lighting retrofit studies",
  },
  {
    id: "air_sealing",
    name: "Envelope air sealing and insulation",
    capexUsdPerSqft: 3.0,
    emissionsReductionFraction: 0.05,
    basis: "Urban Green Council retrofit guidance",
  },
  {
    id: "heating_plant",
    name: "Heating plant burner and distribution upgrade",
    capexUsdPerSqft: 4.0,
    emissionsReductionFraction: 0.1,
    basis: "NYC Accelerator case studies",
  },
  {
    id: "solar_pv",
    name: "Rooftop solar PV",
    capexUsdPerSqft: 5.0,
    emissionsReductionFraction: 0.03,
    basis: "NYSERDA NY-Sun cost data",
  },
  {
    id: "heat_pumps",
    name: "Partial heat pump electrification",
    capexUsdPerSqft: 12.0,
    emissionsReductionFraction: 0.2,
    basis: "NYC Accelerator electrification studies",
  },
  {
    id: "windows",
    name: "High-performance window replacement",
    capexUsdPerSqft: 15.0,
    emissionsReductionFraction: 0.07,
    basis: "Urban Green Council deep retrofit data",
  },
];

const PERIOD_YEARS: Record<Period, number> = {
  "2024-2029": 6,
  "2030-2034": 5,
  "2035-2039": 5,
};
const HORIZON_YEARS = 16; // 2024 through 2039
const MAX_CATALOG = 12; // 2^12 = 4,096 subsets; enumeration stays instant

export interface RetrofitPlan {
  measureIds: string[];
  capexUsd: number;
  projectedEmissionsTco2e: number;
  horizonFinesUsd: number; // sum of annual fines x years in each period
  totalCostUsd: number; // capex + horizon fines
  results: FineResult[];
}

export interface MaccPoint {
  measureId: string;
  name: string;
  annualReductionTco2e: number;
  usdPerTco2e: number; // capex per tonne abated over the horizon
  basis: string;
}

export interface RetrofitAssessment {
  doNothing: RetrofitPlan;
  best: RetrofitPlan;
  finesAvoidedUsd: number;
  macc: MaccPoint[];
  evaluatedSubsets: number;
  notes: string[];
}

export function optimizeRetrofit(
  building: BuildingInput,
  measures: RetrofitMeasure[] = DEFAULT_MEASURES,
): RetrofitAssessment {
  if (measures.length > MAX_CATALOG) {
    throw new Error(
      `catalog of ${measures.length} exceeds the ${MAX_CATALOG}-measure enumeration cap`,
    );
  }

  const subsetCount = 2 ** measures.length;
  let doNothing: RetrofitPlan | null = null;
  let best: RetrofitPlan | null = null;

  for (let mask = 0; mask < subsetCount; mask++) {
    const chosen = measures.filter((_, index) => mask & (1 << index));
    const plan = evaluatePlan(building, chosen);

    if (mask === 0) doNothing = plan;
    if (!best || plan.totalCostUsd < best.totalCostUsd) best = plan;
  }

  const notes = [
    "Capex and savings are typical-building assumptions, not quotes; every measure names its basis.",
  ];
  if (building.isArticle321) {
    notes.push(
      "Article 321 buildings face flat penalties rather than $268/tCO2e; the optimizer compares capex against the engine's Article 321 results.",
    );
  }

  return {
    doNothing: doNothing!,
    best: best!,
    finesAvoidedUsd: round2(doNothing!.horizonFinesUsd - best!.horizonFinesUsd),
    macc: maccCurve(building, measures),
    evaluatedSubsets: subsetCount,
    notes,
  };
}

function evaluatePlan(building: BuildingInput, chosen: RetrofitMeasure[]): RetrofitPlan {
  const capexUsd = chosen.reduce(
    (sum, measure) => sum + measure.capexUsdPerSqft * building.grossFloorAreaSqft,
    0,
  );

  const remainingFraction = chosen.reduce(
    (fraction, measure) => fraction * (1 - measure.emissionsReductionFraction),
    1,
  );
  const projectedEmissionsTco2e = building.annualEmissionsTco2e * remainingFraction;

  const adjusted = { ...building, annualEmissionsTco2e: projectedEmissionsTco2e };
  const results = (Object.keys(PERIOD_YEARS) as Period[]).map(period =>
    computeFine(adjusted, period),
  );

  const horizonFinesUsd = results.reduce(
    (sum, result) => sum + result.annualFineUsd * PERIOD_YEARS[result.period],
    0,
  );

  return {
    measureIds: chosen.map(measure => measure.id),
    capexUsd: round2(capexUsd),
    projectedEmissionsTco2e: round2(projectedEmissionsTco2e),
    horizonFinesUsd: round2(horizonFinesUsd),
    totalCostUsd: round2(capexUsd + horizonFinesUsd),
    results,
  };
}

function maccCurve(building: BuildingInput, measures: RetrofitMeasure[]): MaccPoint[] {
  return measures
    .map(measure => {
      const capexUsd = measure.capexUsdPerSqft * building.grossFloorAreaSqft;
      const annualReductionTco2e =
        building.annualEmissionsTco2e * measure.emissionsReductionFraction;
      return {
        measureId: measure.id,
        name: measure.name,
        annualReductionTco2e: round2(annualReductionTco2e),
        usdPerTco2e:
          annualReductionTco2e === 0
            ? Infinity
            : round2(capexUsd / (annualReductionTco2e * HORIZON_YEARS)),
        basis: measure.basis,
      };
    })
    .sort((a, b) => a.usdPerTco2e - b.usdPerTco2e);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
```

- [ ] **Step 4: Run to verify pass** — same command, all green; then `npx vitest run` (whole engine suite) and `npx tsc --noEmit`
- [ ] **Step 5: Commit** — `git add engine/ && git commit -m "Retrofit optimizer: try all 128 measure combos, pick the cheapest path through 2039"`

---

## Phase B — Optimizer in tools and drafts, advise.ts narration

### Task B1: assess_building returns the retrofit assessment

**Files:** Modify `data/src/tools.ts`, test `data/tests/tools.test.ts`

- [ ] **Step 1: Failing test** — in the existing tools.test.ts describe block (it already injects a fake `lookupBuilding` returning ESB-like facts):

```typescript
test("assess_building includes the retrofit assessment when projections exist", async () => {
  const reply = JSON.parse(
    await executeDataTool(
      "assess_building",
      { address: "350 5th Avenue" },
      { lookupBuilding: fakeLookup },
    ),
  );
  expect(reply.retrofit.evaluatedSubsets).toBe(128);
  expect(reply.retrofit.best.totalCostUsd).toBeLessThanOrEqual(
    reply.retrofit.doNothing.totalCostUsd,
  );
});
```

- [ ] **Step 2: Verify RED** (`retrofit` undefined)
- [ ] **Step 3: Implement** — in `tools.ts`: import `optimizeRetrofit`/`RetrofitAssessment` from `../../engine/src/retrofit.ts`; add `retrofit: RetrofitAssessment | null` to `Assessment`; in the success branch return `retrofit: optimizeRetrofit(input)`, in the missing-data branch `retrofit: null`.
- [ ] **Step 4: GREEN + whole data suite + typecheck**
- [ ] **Step 5: Commit** — `git commit -m "assess_building now answers 'what should I do about it' with the optimizer's cheapest path"`

### Task B2: retrofit lines in the scripted LL97 draft

**Files:** Modify `agents/src/projections.ts`, `agents/src/policies/scripted.ts`; test `agents/tests/scripted.test.ts`

- [ ] **Step 1: Failing test** — scripted emissions draft for an over-cap building (existing fixtures have one) must include `Cheapest path` and the assumptions disclaimer.
- [ ] **Step 2: RED**
- [ ] **Step 3: Implement** — `projections.ts` gains, mirroring `projectFines`:

```typescript
export function projectRetrofit(input: DraftInput): RetrofitAssessment | null {
  if (input.annualEmissionsTco2e === undefined || input.uses.length === 0) return null;
  try {
    return optimizeRetrofit({
      grossFloorAreaSqft: input.sqft,
      occupancyGroups: input.uses,
      annualEmissionsTco2e: input.annualEmissionsTco2e,
      isArticle321: input.isAffordable,
    });
  } catch {
    return null;
  }
}

export function renderRetrofitLines(assessment: RetrofitAssessment): string[] {
  if (assessment.best.measureIds.length === 0) return [];
  const best = assessment.best;
  return [
    "Cheapest path to compliance (capex assumptions, not quotes):",
    `  measures: ${best.measureIds.join(", ")}`,
    `  capex $${best.capexUsd.toLocaleString("en-US")} -> ` +
      `${best.projectedEmissionsTco2e.toLocaleString("en-US")} tCO2e/yr, ` +
      `avoids $${assessment.finesAvoidedUsd.toLocaleString("en-US")} in fines through 2039`,
  ];
}
```

`scripted.ts` emissions template splices `...retrofitLines(input)` after the cliff table (helper like `cliffTableLines`).

- [ ] **Step 4: GREEN + typecheck**
- [ ] **Step 5: Commit** — `git commit -m "LL97 drafts now name the cheapest retrofit combo, with assumptions disclosed"`

### Task B3: advise.ts board summary + CLI

**Files:** Create `agents/src/ai/advise.ts`, `agents/scripts/advise.ts`; test `agents/tests/advise.test.ts`; modify `agents/src/policies/llm.ts` (export `ModelTurn`, `CreateMessageParams`)

- [ ] **Step 1: Failing test** — fake `createMessage` capturing params; assert the user message embeds the assessment JSON (injected fake `executeTool`), system prompt forbids new numbers, returned text comes back.
- [ ] **Step 2: RED**
- [ ] **Step 3: Implement** — `adviseBoardSummary(address, deps)`: one `assess_building` tool call (via `executeDataTool` by default, injectable), one Claude call (`claude-opus-4-8` default, `ANTHROPIC_MODEL` override) with a system prompt: numbers verbatim from the data only, structure = exposure / cheapest path / first three actions, end with the human-review line. CLI script prints to stdout.
- [ ] **Step 4: GREEN + typecheck**
- [ ] **Step 5: Commit** — `git commit -m "advise.ts: one-page board summary where every number is the engine's"`

---

## Phase C — RAG over LL97 law text

### Task C1: BM25 ranker

**Files:** Create `data/src/bm25.ts`; test `data/tests/bm25.test.ts`

- [ ] **Step 1: Failing tests** — doc sharing more query terms ranks first; rare-term idf beats common-term; empty query returns []; topK respected.
- [ ] **Step 2: RED**
- [ ] **Step 3: Implement** — standard BM25, k1=1.2 b=0.75, tokens = `text.toLowerCase().match(/[a-z0-9]+/g) ?? []`, idf = `Math.log(1 + (N - df + 0.5) / (df + 0.5))`.
- [ ] **Step 4: GREEN**
- [ ] **Step 5: Commit** — `git commit -m "Plain BM25 ranker, no deps, so law lookup works offline"`

### Task C2: corpus + retrieval + ask_law tool

**Files:** Create `data/corpus/ll97.json`, `data/src/ask.ts`; modify `data/src/tools.ts`, `agents/src/policies/llm.ts` (LlmDeps input widens to `Record<string, string>`); test `data/tests/ask.test.ts`; create `agents/scripts/ask.ts`

**Corpus rule:** every chunk's `text` is verified against the live source (WebFetch the American Legal admin-code page / DOB rule PDF) during execution — never written from memory. Chunks carry `{ id, source, url, text }`. Minimum set: 28-320.3.1 limits, 28-320.3.1.1 coefficients, 28-320.3.7 penalty + the 1 RCNY 103-14(h) $268 rate, 28-320.3.7 GFE mitigation, 28-321.2 (Article 321 compliance paths), 28-321.2.2 prescriptive measures list.

- [ ] **Step 1: Failing tests** — `retrieveLawChunks("penalty per ton over the limit")` top hit is the penalty chunk; `executeDataTool("ask_law", { question })` returns JSON whose `chunks` all carry `source` and `url` and whose `instruction` says answer-only-from-chunks; unknown topic ("zoning variances") returns low/zero-score guidance to refuse.
- [ ] **Step 2: RED**
- [ ] **Step 3: Implement** — `ask.ts` loads the corpus once (readFileSync, Node-only like coveredBuildings.ts), `retrieveLawChunks(question, topK = 4)`. `tools.ts` adds the `ask_law` definition (input `{question}`) and dispatcher branch returning `{ instruction, chunks }` where instruction = "Answer only from these chunks. Cite source and url for every claim. If the chunks do not support an answer, say the corpus does not cover it." `agents/scripts/ask.ts` runs a small tool loop (same SDK pattern as llm.ts) with only ask_law.
- [ ] **Step 4: GREEN, both workspaces + typecheck**
- [ ] **Step 5: Commit** — `git commit -m "ask_law: cited answers from the statute text itself, refusal when it can't"`

---

## Phase D — LL152 and LL55

### Task D1: registry entries + intake coverage

**Files:** Modify `spacetimedb/src/laws.ts`, `data/src/intake.ts`; test `data/tests/laws.test.ts` (new), `data/tests/intake.test.ts` (extend)

- [ ] **Step 1: Failing tests** — `applicableLaws(80_000, false)` contains ll152 and not ll55; `applicableLaws(80_000, true)` contains ll55; `prepareIntake` coveredLawIds gains ll152 always and ll55 when `isArticle321`.
- [ ] **Step 2: RED**
- [ ] **Step 3: Implement** — registry entries:

```typescript
{
  id: "ll152",
  name: "LL152 — Gas Piping Inspection & Certification",
  kind: "gas_piping_certification",
  deadlineDays: 150, // community-district cycle stub; P1 maps the CD to its filing year
  appliesTo: () => true, // gas service assumed present until DOB data lands (1-2 family exempt, not in our data)
  fineEstimateUsd: () => 10_000, // failure-to-certify civil penalty
},
{
  id: "ll55",
  name: "LL55 — Indoor Allergen Hazards (Mold & Pests)",
  kind: "mold_pest_remediation",
  deadlineDays: 60,
  appliesTo: (_sqft, isAffordable) => isAffordable, // residential proxy until unit counts land (P1)
  fineEstimateUsd: () => null, // HPD violation classes vary too widely to stub honestly
},
```

`intake.ts`: append `"ll152"` unconditionally when the building is on the CBL, and `"ll55"` when `cbl.article321` (same residential proxy, same comment).

- [ ] **Step 4: GREEN + typecheck**
- [ ] **Step 5: Commit** — `git commit -m "Two more laws on the board: gas piping certs (LL152) and mold/pest duties (LL55)"`

### Task D2: scripted templates + republish

**Files:** Modify `agents/src/policies/scripted.ts`; test `agents/tests/scripted.test.ts`

- [ ] **Step 1: Failing tests** — drafts for both kinds carry concrete steps (LMP outreach / GPS2 cert; HPD complaint triage / tenant-safe remediation) and the human-review line.
- [ ] **Step 2: RED**
- [ ] **Step 3: Implement** — two TEMPLATES entries in the established voice.
- [ ] **Step 4: GREEN; then `spacetime publish --module-path spacetimedb --server local fineprint -y --delete-data=always && npm run generate && npm run seed`; confirm seed now spawns the new task kinds; whole-repo `npm run typecheck`**
- [ ] **Step 5: Commit** — `git commit -m "Playbooks for the new laws so no task lands without a draft"`

---

## Phase E — Offline demo caches

### Task E1: data snapshot cache

**Files:** Create `data/src/cache.ts`; modify `data/src/http.ts`, `data/src/geosearch.ts`, `data/src/ll84.ts`; test `data/tests/cache.test.ts`

- [ ] **Step 1: Failing tests** — `cacheWrite`/`cacheRead` round-trip (cache root overridable via `FINEPRINT_CACHE_DIR` so tests use a tmp dir); `cachedFetchJson` returns live data and writes the snapshot; when the fetcher throws and a snapshot exists, serves it with a warning; when neither, rethrows the live error.
- [ ] **Step 2: RED**
- [ ] **Step 3: Implement** — `cache.ts`: file per key at `<root>/<service>/<sha1(key) first 16 hex>.json`, payload `{ key, recordedAt, value }`; root = `FINEPRINT_CACHE_DIR` or `data/cache/`. `http.ts` gains `cachedFetchJson` (try live → write → return; catch → read → warn + return, else rethrow). Cache keys strip any `$$app_token` query param so tokens never hit disk. Swap the `fetchJson` call in `geosearch.ts` and `ll84.ts` to `cachedFetchJson`.
- [ ] **Step 4: GREEN + typecheck; run `RUN_INTEGRATION=1` intake test once to populate `data/cache/` for the demo buildings, commit the snapshots**
- [ ] **Step 5: Commit** — `git commit -m "Demo survives dead wifi: live lookups leave snapshots and fall back to them"`

### Task E2: LLM draft cache

**Files:** Modify `agents/src/policies/llm.ts`; test `agents/tests/llm_cache.test.ts`

- [ ] **Step 1: Failing tests** — successful `draftWithTools` writes `<dir>/<kind>-<bbl|address-slug>.md` (dir = `FINEPRINT_LLM_CACHE_DIR` or `agents/cache/llm/`); when drafting throws and a cached file exists, `draftLlm` returns it (with a `[cached]` marker line) instead of the scripted fallback; no cache file → scripted fallback as today.
- [ ] **Step 2: RED**
- [ ] **Step 3: Implement** — small read/write helpers in llm.ts (or `llmCache.ts` if > ~30 lines); wire into draftLlm's success and catch paths.
- [ ] **Step 4: GREEN + typecheck + full agents suite**
- [ ] **Step 5: Commit** — `git commit -m "Cache good LLM drafts so the demo replays them when the API is down"`

---

## Final validation (after Phase E)

- [ ] `npm run typecheck` — all workspaces
- [ ] `npx vitest run` in engine, data, agents — all green
- [ ] `npx prettier --check .`
- [ ] Live: republished module, seeded; `request_building` a real address; confirm new ll152/ll55 tasks spawn, LL97 draft carries retrofit lines; `npx tsx agents/scripts/ask.ts "what is the penalty per ton?"` answers with citations; `npx tsx agents/scripts/advise.ts <address>` produces the board summary
- [ ] Offline drill: disconnect (or fake by pointing `SOCRATA_APP_TOKEN`/hosts at nothing), re-run intake for a cached building — pipeline serves snapshots

## Self-review notes

- Spec coverage: optimizer (A), narration (B), RAG (C), LL152/LL55 (D), offline caches (E). Doc's SQLite board / API routes intentionally dropped per substrate decision. Doc's extract.ts is P3 stretch — out of scope, recorded here so it isn't silently lost.
- Type consistency: `RetrofitAssessment` defined once in engine, imported by data tools and agents projections. `LlmDeps.executeTool` widening in C2 is the only signature change to existing code.
- LL55 `kind` string (`mold_pest_remediation`) matches between laws.ts, scripted.ts templates, and tests; same for `gas_piping_certification`.

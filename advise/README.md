# advise

The funded fix-it-plan layer. Pure, deterministic economics on top of the
engine's `FineResult[]` — **code computes every number; an AI layer only ranks,
explains, and cites.** No network I/O; the only disk read is the bundled statute
corpus, so this package is Node-only (like `data/`'s covered-buildings reader).

## What's here

| Module | What it does |
|--------|--------------|
| `src/catalogs/` | Verified 2026 retrofit-**measure** and **rebate** catalogs (`MEASURES`, `REBATES`) with explicit eligibility flags. Pure data. |
| `src/roi.ts` | `computeCandidateFixes(fines, measures, rebates, planPeriod, ctx)` → ranked `FixCandidate[]`: tCO₂e cut, matched rebates, net cost, payback. Sorted by payback. |
| `src/optimize/retrofit.ts` | `optimizeRetrofit(input, measures, rebates)` → exact-optimal `RetrofitPlan` (enumerates all 2^N measure subsets), plus `buildMacc` (marginal-abatement-cost curve) and a pre-2030-cliff schedule. |
| `src/rag/` | `retrieve(query, k)` — offline Okapi-BM25 retriever over `corpus/*.md` (curated LL97 statute text with official URLs). For citation-grounded drafting. |

## Inputs (caller-supplied)

Both `roi.ts` and `retrofit.ts` are decoupled from any building object. The caller
passes the engine's `FineResult[]` plus a small context:

- `fuels: string[]` — `'gas'|'oil'|'steam'|'electric'`; a measure applies if it
  targets `'any'` or any of these. (Derive from the building's LL84 fuel columns.)
- `units: number | null`, `grossFloorAreaSqft`, `isMultifamily`, `affordable`.

The cost basis is `$/sqft × GFA` (works for every building type), falling back to
per-dwelling-unit only when GFA is missing.

## Money & honesty

- The `$268/tCO₂e` penalty is a local `268` (USD/ton) constant — this package
  never touches the engine's internal cents representation, so the two can't mix.
- Catalog figures are **estimates**, program-year specific. ⚠️ Re-verify the IRA
  §179D / §45L numbers (shifted by OBBB in 2025) before relying on them; see the
  warnings in `rebates.ts`.

## Develop

```bash
npm run test --workspace advise        # vitest (roi + optimizer golden + RAG)
npm run typecheck --workspace advise   # tsc --noEmit
```

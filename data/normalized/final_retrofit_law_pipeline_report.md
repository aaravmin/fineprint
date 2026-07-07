# Final retrofit / law / binder pipeline report

Implementation summary for the roadmap (Phases 1–9). Results below are reported
honestly: success is claimed only where the check actually passes.

## Verification results

| Check                      | Command                            | Result                                 |
| -------------------------- | ---------------------------------- | -------------------------------------- |
| Typecheck (all workspaces) | `npm run typecheck`                | **pass**                               |
| Production build           | `npm run build --workspace client` | **pass** (all routes compile)          |
| Law dashboard audit        | `npm run audit:laws`               | **pass — 9/9**                         |
| Compliance binder audit    | `npm run audit:binder`             | **pass — 19/19**                       |
| Tests (all workspaces)     | `npm test`                         | **pass — 229 passed, 6 skipped**       |
| Lint                       | `npm run lint --workspace client`  | **4 errors, all pre-existing (biome)** |

Lint note: the 4 errors are pre-existing and sit outside this work's diff hunks —
three a11y roles on the combobox list in `src/components/address-autocomplete.tsx`
(224, 236, 239) and one non-exhaustive `map()` return in the unchanged `DraftBody`
of `compliance-section.tsx` (169). None block the build or typecheck, and none are
in the Phase 1–8 deliverables. Biome also reports 12 warnings and 187 infos.

## Data sources successfully parsed

- **REMDB** (`data/remdb/remdb_measures.json`): 133 measures from the public REMDB
  2024 .xlsx (price-regression evaluated at metric midpoints). `npm run fetch:remdb`.
- **NYC cost PDFs** (`data/normalized/nyc_retrofit_cost_tables.json`): 37 measure
  cost rows from the three NYSERDA/Urban Green PDFs, each with source page.
  `npm run extract:nyc-pdfs`.
- **ResStock NY** (`data/normalized/resstock_upgrade_curves.json`): 32 upgrade
  savings curves (p25/median/p75 energy + utility) for climate zone 4A, streamed
  from the gzipped-tar `.csv.gz` files. `npm run parse:resstock`.
- **Master merge** (`data/normalized/measure_cost_savings_master.json`): 14 master
  measures — cost from NYC PDF then REMDB, savings from ResStock, sources and
  confidence preserved. `npm run merge:measures`.

## Dashboard laws verified

All 10 registry laws (ll97, art321, ll84, ll87, ll11, ll88, ll33, ll152, ll96,
ll55) render on the dashboard and use the canonical name from
`client/src/lib/laws/lawRegistry.ts`. The audit confirms the registry's id/short
sets match the canonical module registry (`data/src/laws.ts`).

- **Laws missing calculations**: none for the modeled set — LL97/art321 use the
  emissions engine; filing laws use statutory penalty/cycle figures. (Elevator,
  sprinkler, and LL26 from the roadmap's alias examples are not implemented and
  are intentionally absent.)
- **Laws missing source data**: surfaced per building — the compliance report now
  shows binding laws in full and lists the rest under "Not tracked for this
  building" with the reason (does-not-apply criterion, or the missing data).

## Compliance binder implemented (Phase 7)

- Models (Postgres tables on Supabase, owner-scoped by RLS): `vendor`, `obligation`,
  `evidence`, `binder_event`. Obligation statuses, evidence verification statuses,
  and 13 vendor roles per the roadmap.
- Reducers: seed_obligations, add_vendor, assign_vendor, set_obligation_status,
  add_evidence, set_evidence_verification, add_binder_note — each appends a
  customer-facing `binder_event` (kept separate from the internal `event` log).
- Evidence checklist per law (required vs recommended), grounded in each law's
  filings; uncertain proof is recommended, never invented as required.
- Exportable binder (`client/src/lib/compliance/binder.ts`) + the `ComplianceBinder`
  UI (obligations, status, vendor assignment, proof filing, missing-evidence,
  history, JSON download), linked from the building dashboard.

## Professional formatting (Phase 8)

- Research report from ASHRAE/LL97 consultant conventions
  (`professional_output_format_research.md`).
- `ComplianceReport` deliverable (snapshot → law-by-law findings → recommendations
  → action plan → assumptions → source appendix), pure builder in
  `complianceReportTemplate.ts`, professional language, names from the registry.
- A consumer-language scan found none of the banned phrases.

## Fallback assumptions used

- None in the master merge: where neither a NYC PDF nor REMDB cost exists
  (drill-and-fill wall insulation), cost is left null rather than fabricated.
- `carbon_savings` is left null throughout (needs per-fuel emission factors not in
  these sources).

## Recommended next steps

- Wire the Phase 5 master measure cost ranges (low–high $, annual $ savings,
  useful life) into the compliance report's recommendation table.
- Backfill Building Summary fields (borough, BIN, year built, primary use) from
  PLUTO into the Building row.
- Address the 10 pre-existing lint errors separately from this roadmap.
- Per-owner server-side binder export endpoint (today the export is generated in
  the authenticated client; `compliance_binder_sample.json` is the structural sample).

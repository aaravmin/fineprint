# Fineprint roadmap

How one address becomes genuine, building-specific compliance advice — what we
inherited from the data layer, what the obligation framework (tasks A–D) added on
top, and what is left to build.

## The shape of the system

```
address
  └─ data layer (inherited)        resolve BBL/BIN, pull every NYC dataset
       └─ BuildingFacts            sourced facts + InfrastructureProfile
            └─ obligation framework (A–D)
                 ├─ analyzers      one per law: performance or procedural
                 ├─ optimizers     standard fine-trade / Article 321 constrained
                 └─ compliancePlan one plan, every law disposed of once
                      └─ advise     owner-ready narration, numbers quoted not invented
```

Backend invariant (unchanged): SpacetimeDB is the only writer. The browser and
agent workers open WebSockets directly; reads are subscriptions, writes are
reducers. The data layer and engine are pure libraries the workers call.

## Inherited from the data layer

The "data discovery" work gave us an address-to-facts pipeline. Everything the
obligation framework reasons about comes from here.

- **Address resolution** — GeoSearch resolves an address to a BBL and BIN, with
  a covered-buildings-list reconciliation so a renumbered lot still maps to the
  tax lot DOF files under. `data/src/geosearch.ts`, `lookup.ts`.
- **Dataset fetchers**, all keyed by BBL or BIN, each tagging provenance:
  - LL84 benchmarking disclosure — floor area, use splits, reported and
    statute-recomputed emissions, fuel mix, ENERGY STAR score. `ll84.ts`.
  - PLUTO — floors, building class, units, year built, community district.
    `pluto.ts`.
  - DOB boiler inspections, build-job permits, electrical permits, open ECB
    violations. `boilers.ts`, `permits.ts`, `electrical.ts`, `ecb.ts`.
  - LL97 covered-buildings list — authoritative coverage and Article 321 flag.
    `coveredBuildings.ts`.
- **InfrastructureProfile** — the derived equipment signals the advice is built
  on: heating fuel, PV presence, boiler count and condition, recent HVAC work,
  efficiency tier. `lookup.ts`.
- **The fine engine** — pure, deterministic LL97 math: per-period limits and
  penalties, the Article 321 pathway, and a retrofit optimizer. `engine/src/`.
- **Agent + narration scaffolding** — tool definitions for agents, an intake
  path that ingests a building into SpacetimeDB, and a board-summary narrator
  that may only quote engine-computed numbers. `data/src/tools.ts`,
  `intake.ts`, `agents/src/ai/advise.ts`.
- **Honesty contract** — every fact carries provenance; fields the city cannot
  answer are null, never guessed. The framework keeps this contract.

## What tasks A–D added

The obligation framework turns facts into advice. Laws became thin declarations;
the shared math lives in the engine and the analyzer layer.

### Task A — the obligation model and orchestrator

`data/src/obligations.ts`. Every law reduces to obligations of two kinds:

- **Procedural** — file or inspect by a deadline; fixed penalty; the question is
  whether it is on record.
- **Performance** — hold emissions under a cap; the remedy is physical measures
  with a real cost/impact tradeoff, carrying the engine's per-period results so
  no number is recomputed downstream.

`assessObligations(facts)` runs every applicable analyzer and returns the full
obligation set. A law may emit both kinds. Missing data degrades to an `unknown`
status rather than a guess.

### Task C — building-aware retrofit planning

`data/src/retrofit.ts`. The engine stays pure (it optimizes whatever catalog it
is handed); this layer decides which measures apply to one real building:

- Drops measures the record shows are done (solar when PV exists; both
  combustion measures when all-electric).
- Keeps softer signals (efficiency tier, recent work) as findings, not removals,
  so the optimizer is never starved on a guess.
- Emits equipment-specific findings the narration can quote ("two boilers with
  defects on record — a heating-plant upgrade is both a repair and the cheapest
  combustion cut").

### Task B — the filing-status capability

`data/src/filings.ts`. One reusable shape (`dueDate`, `cycle`, `onRecord`,
`status`, `action`, `basis`) computed for any law from building attributes and an
injectable `asOf` date. Lit up four procedural laws as honestly as the data
allows:

- **LL84** — fully wired; annual May 1 cycle, currency from the reporting year on
  file (satisfied / at_risk / due).
- **LL87** — 10-year cycle dated off the tax-block last digit; status unknown
  until the deadline is within ~18 months, since no dataset confirms the filing.
- **LL11/FISP** — applies only when PLUTO confirms over six stories; sub-cycle
  window left undated rather than fabricated.
- **LL152** — surfaces the community district; CD-to-year schedule left undated.

### LL88 and Article 321

- **LL88** — procedural (one-time lighting + submetering deadline, now passed).
  Its lighting upgrade is the same action as the LL97 LED measure, so it
  cross-references that plan instead of double-counting.
- **Article 321** — a different regime needing a new optimizer:
  `optimizeArticle321` minimizes capex subject to clearing the 2030 target (no
  per-tonne fine to trade against). Returns no plan when even the full catalog
  cannot reach the target — the prescribed-measures pathway is then the route.

### Task D — the whole-building compliance plan

`data/src/compliancePlan.ts`. The payoff. Measures declare which laws they retire
(`satisfiesLaws`); `buildCompliancePlan(facts)` joins obligations to the retrofit
plan and gives every obligation exactly one disposition
(`retrofit_measures` / `filing` / `already_compliant` / `needs_attention`). When
the cheapest LL97 plan includes LED lighting, LL88 is shown as handled by that
measure — one action, one cost, counted once. This is the spine the narration
now presents.

### Coverage today

| Law         | Kind        | Status                                                       |
| ----------- | ----------- | ------------------------------------------------------------ |
| LL97        | performance | full — fine projections + building-aware optimizer           |
| Article 321 | performance | full — constrained optimizer, both pathways                  |
| LL84        | procedural  | full — cycle + on-record currency                            |
| LL87        | procedural  | cycle dated; city dataset is a file blob, not queryable      |
| LL88        | procedural  | deadline + LL97 cross-credit, credited in measure selection  |
| LL11        | procedural  | full — sub-cycle windows dated, filings from xubg-57si       |
| LL152       | procedural  | CD schedule dated (1 RCNY 103-10); no filing dataset exists  |
| LL55        | procedural  | analyzed — annual allergen duty keyed to PLUTO unit counts   |

## Forward roadmap

Ordered by leverage. Items 1-6 are done; what remains of each is noted.

1. **Surface the compliance plan in the dashboard.** Done — intake serializes
   `buildCompliancePlan` into `building.compliancePlanJson`; the building view
   renders pathway, measures, dispositions, cross-credits, and provenance
   footnotes. Buildings added before this change carry no plan until re-ingested.
2. **Fill the deferred cycle mappings.** Done — FISP Cycle 10 sub-cycle windows
   (A: blocks 4/5/6/9 from Feb 2025; B: 0/7/8 from 2026; C: 1/2/3 from 2027,
   recurring every 5 years) and the LL152 four-year district rotation
   (2024: 1/3/10; 2025: 2/5/7/13/18; 2026: 4/6/8/9/16; 2027: 11/12/14/15/17).
3. **Confirm procedural filings against real datasets.** LL11 done — DOB NOW
   Safety Facades (xubg-57si) is wired; a real report reads satisfied, DOB's
   auto-generated "No Report Filed" placeholder reads due. LL87's dataset
   (au6c-jqvf) is a file attachment, not a queryable table, and LL152 has no
   public certification dataset — both honestly stay `onRecord: null`.
4. **Add LL55 (indoor allergen hazards).** Done — applies at 3+ residential
   units from PLUTO (Article 321 flag as fallback when PLUTO is silent); annual
   inspection duty with no filing to confirm, penalty left null honestly.
5. **Fold procedural penalties into the optimizer objective.** Done — the
   optimizer accepts `proceduralPenaltySavingsByLaw`; a subset containing a
   measure that retires a due procedural law is credited that penalty once per
   law. The compliance plan and the assess_building tool feed the same map, so
   selection and narration agree.
6. **Orchestrate per-law agents off one address.** Wired — `worker:emissions`,
   `worker:filings`, and `worker:inspections` scripts run kind-filtered pools
   over the existing per-law task emission.
7. **Verify and date the assumptions.** Partially — the LL11 and LL152 cycle
   rules now cite 1 RCNY 103-04 / 103-10 with verified windows. Still open:
   retrofit capex and savings remain editorial typical-building figures, and the
   LL87 block-digit mapping still needs confirming against the DOB calendar.

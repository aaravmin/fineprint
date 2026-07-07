# Expansion: Fineprint × an inspection-AI startup (e.g. InspectMind AI)

InspectMind AI builds AI for construction and field inspections — turning photos,
voice notes, and field observations into structured inspection reports. Fineprint
owns the _compliance_ layer (which laws bind a building, what's due, what proof is
missing, what it costs to fix). The two are complementary: compliance defines the
work; inspection produces the proof. The strongest expansion directions, ordered
by how directly they reuse what already exists.

## 1. Inspection-driven evidence (the tightest fit)

Several NYC obligations are _satisfied by a licensed inspection_, and the binder
already names the exact proof each one needs:

| Law                 | Required inspection proof (already in the registry)        | Inspector role          |
| ------------------- | ---------------------------------------------------------- | ----------------------- |
| LL11 / FISP         | "QEWI facade safety report (FISP) filing confirmation"     | QEWI                    |
| LL152               | "Gas piping inspection report (GPS1)", "LMP certification" | LMP                     |
| LL87                | "ASHRAE Level II energy audit report"                      | energy auditor          |
| (boiler / elevator) | inspection report + correction proof                       | elevator/general vendor |

An InspectMind inspection report becomes the **evidence** for exactly that
obligation. The plumbing is already there: the binder's `add_evidence` reducer,
the per-law evidence checklist, the vendor model (roles QEWI / LMP / auditor),
and the missing-required-evidence surfacing. InspectMind generates the report;
Fineprint files it against the obligation and flips the missing-evidence flag.

## 2. Compliance deadlines → inspection scheduling

The binder carries each law's statutory cycle (FISP sub-cycle window, LL152
community-district year, LL87 tax-block decade) and a per-obligation due date.
That tells an inspection product _when_ an inspection is due and _which_ building
needs it; the missing-required-evidence list tells it _what_ to inspect. A daily
"what's due in the next 90 days, by inspection type" feed is a direct query over
the obligation table.

## 3. One defensible deliverable

Phase 8's professional report template + Phase 7's evidence binder + an inspection
report engine combine into a single owner/lender/regulator-grade document:
compliance findings, the retrofit recommendations, _and_ the field inspection
evidence behind them — exported through the same versioned schema.

## 4. The export schema is the integration surface

The v1 export (`docs/compliance-export-schema.json`) — stable `law_id` keys,
`building_identifiers.{bbl,bin}`, structured `source_citations`, and the
obligation/evidence model — is exactly what an external inspection platform would
ingest to pull a building's obligations and push inspection evidence back, without
an API server on either side.

## 5. Multi-jurisdiction Building Performance Standards

The canonical law-registry pattern (Phase 6) and the obligation/evidence model are
jurisdiction-agnostic; only the registry entries are NYC-specific. 40+ US cities
now have Building Performance Standards. An inspection startup with a national
field-ops footprint is the natural distribution channel for a multi-city version.

## 6. Vendor / inspector network

The binder already models vendors and assignment (QEWI, LMP, auditor, contractor).
Connecting obligation assignment to an inspector marketplace — and back-filling the
evidence automatically when the inspector files — closes the loop from "this is due"
to "here is the proof it's done."

## Lowest-effort first step

Wire an inspection-report upload (or webhook) into `add_evidence`, keyed by
`building_id` + `law_id`, so an LL11/LL152/LL87 inspection lands as binder evidence
and clears the missing-required-evidence flag. Everything downstream (history,
export, the professional report's evidence trail) already consumes it.

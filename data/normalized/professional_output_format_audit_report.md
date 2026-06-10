# Professional output format audit report

What changed to make Fineprint's building outputs read like a professional
compliance/audit deliverable, and what is still generic.

## Sources reviewed

See `professional_output_format_research.md` for the full list — ASHRAE
*Procedures for Commercial Building Energy Audits* and sample Level II reports
(SUNY, PNNL), and NYC Local Law 97 consultant deliverables (Milrose, AEI, ENPG,
Henson). The conventions distilled there drove the changes below.

## Formatting conventions adopted

- **The professional eight-section spine**: Building Summary → Compliance
  Snapshot → Law-by-Law Findings → Retrofit Recommendations → Action Plan →
  Assumptions & Limitations → Source Appendix (the evidence trail lives in the
  Phase 7 compliance binder).
- **Flat, conditional status language**: "Applies / May apply / Does not apply /
  Unknown / Missing data"; exposure phrased as "Estimated annual exposure of $X
  based on available records" and "No immediate exposure identified based on
  available records" — never "you're all set."
- **Costs as ranges with units**, deadlines as dates or named statutory cycles,
  and an explicit assumptions/limitations block plus a source appendix on every
  report.
- **Recommendations framed as preliminary**, ordered by priority, with a "not a
  final engineering scope" caveat.
- **Canonical naming**: every finding and recommendation pulls its law name from
  the Phase 6 law registry, so the report never invents a second name.

## App components created / updated

- `client/src/lib/output/complianceReportTemplate.ts` — pure builder for the
  professional `ComplianceReport` (structure + language).
- `client/src/components/dashboard/ComplianceSnapshot.tsx`,
  `LawFindingCard.tsx`, `ActionPlanTable.tsx`, `SourceAppendix.tsx`,
  `ComplianceReport.tsx` — the professional report, rendered print-ready and
  linked into the building dashboard's "All laws" view.
- `investment-planner.tsx` — "no fines remain" → "no modeled fines remain …on the
  current projection" for precision.

## Before / after output structure

- **Before**: an "Exposure by law" bar card, per-law tabs, a fine timeline, and
  an investment planner — strong, but with no single consultant-style report and
  no explicit assumptions/source appendix surfaced to the owner.
- **After**: the above, plus a top-of-page **Compliance report** that opens with a
  records-based snapshot, states each requirement's status/exposure/missing data,
  lists prioritized actions, and closes with assumptions and a source appendix —
  printable to PDF.

## Consumer-language scan

- A scan of `client/src` for the banned phrases ("you're all set", "great job",
  "looks good", "your building is healthy", "here's what you should do") found
  **none** — the app was already written in a measured voice. The one softened
  line was the investment planner's "no fines remain."

## Places that still feel generic / TODOs

- The recommendation table draws cost as a `$/tCO₂e abated` basis from the engine's
  marginal-abatement curve; wiring the Phase 5 master measure ranges (low–high $,
  annual $ savings, useful life) would make it fully match the professional
  "estimated cost range / simple payback" convention.
- Building Summary lacks borough, BIN, year built, and primary use until those
  reach the Building row from PLUTO.
- The Compliance Snapshot's "highest-risk" ranking uses modeled exposure only; a
  deadline-proximity weighting would match how consultants triage.

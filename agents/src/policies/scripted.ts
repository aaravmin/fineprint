// Zero-LLM drafting policy (DEFAULT). The demo must work with no API keys.
import type { DraftInput } from "./types.ts";

const TEMPLATES: Record<string, (i: DraftInput) => string> = {
  emissions_fine_analysis: input =>
    [
      `LL97 EXPOSURE ANALYSIS — ${input.address}`,
      ``,
      ...(input.annualEmissionsTco2e !== undefined
        ? [
            `Reported annual emissions: ${input.annualEmissionsTco2e.toLocaleString()} tCO2e.`,
          ]
        : []),
      `Estimated annual penalty: $${fmt(input.fineEstimateUsd)} ($268 per tCO2e over cap).`,
      `Recommended sequence:`,
      `  1. Pull 24 months of utility data; verify against LL84 benchmarking submission.`,
      `  2. Commission energy model to size the overage before paying a dollar of fines.`,
      `  3. Price the gap closers: BMS scheduling fixes, heating plant controls, LED completion.`,
      `  4. If overage persists, evaluate Good Faith Efforts filing to defer penalties.`,
      ``,
      `Draft prepared by scripted policy. Human review required before any filing.`,
    ].join("\n"),
  prescriptive_measures_plan: input =>
    [
      `ARTICLE 321 COMPLIANCE PLAN — ${input.address}`,
      ``,
      `Building qualifies for the affordable-housing pathway: implement the prescriptive`,
      `measures list instead of meeting the emissions cap.`,
      `  1. Confirm eligibility documentation with HPD records.`,
      `  2. Schedule the 13 prescriptive measures survey (controls, insulation, low-flow).`,
      `  3. File certification of completed measures before the deadline.`,
      ``,
      `Draft prepared by scripted policy. Human review required before any filing.`,
    ].join("\n"),
  benchmarking_filing: input =>
    [
      `LL84 BENCHMARKING FILING — ${input.address}`,
      ``,
      `Annual energy and water benchmarking due. Exposure if missed: $${fmt(input.fineEstimateUsd)}/yr.`,
      `  1. Confirm ESPM property profile is current (sqft: ${input.sqft.toLocaleString()}).`,
      `  2. Request whole-building aggregate data from utilities.`,
      `  3. Submit through the NYC portal; archive the confirmation number.`,
      ``,
      `Draft prepared by scripted policy. Human review required before any filing.`,
    ].join("\n"),
  audit_filing: input =>
    [
      `LL87 AUDIT & RETRO-COMMISSIONING — ${input.address}`,
      ``,
      `Energy audit + RCx filing cycle is due. Exposure if missed: $${fmt(input.fineEstimateUsd)}.`,
      `  1. Engage a registered energy auditor (ASHRAE Level II).`,
      `  2. Complete retro-commissioning checklist on base building systems.`,
      `  3. File EER through DOB NOW before the deadline.`,
      ``,
      `Draft prepared by scripted policy. Human review required before any filing.`,
    ].join("\n"),
  facade_inspection: input =>
    [
      `LL11 / FISP FACADE CYCLE — ${input.address}`,
      ``,
      `Facade inspection filing window is open. Failure-to-file exposure: $${fmt(input.fineEstimateUsd)}/yr.`,
      `  1. Retain a QEWI (Qualified Exterior Wall Inspector).`,
      `  2. Schedule close-up inspection; budget sidewalk shed only if unsafe conditions found.`,
      `  3. File SWARMP or Safe report in DOB NOW: Safety.`,
      ``,
      `Draft prepared by scripted policy. Human review required before any filing.`,
    ].join("\n"),
  lighting_submetering_plan: input =>
    [
      `LL88 LIGHTING & SUBMETERING — ${input.address}`,
      ``,
      `Lighting code upgrade + tenant submetering required by deadline.`,
      `  1. Survey non-compliant fixtures against NYCECC lighting standards.`,
      `  2. Identify tenant spaces over 5,000 sqft lacking submeters.`,
      `  3. Stage installs with tenant turnover to cut cost; file compliance report.`,
      ``,
      `Draft prepared by scripted policy. Human review required before any filing.`,
    ].join("\n"),
};

function fmt(amount: number | undefined): string {
  return amount === undefined ? "TBD" : amount.toLocaleString();
}

export function draftScripted(input: DraftInput): string {
  const template = TEMPLATES[input.kind];
  const body = template
    ? template(input)
    : [
        `COMPLIANCE DRAFT — ${input.title}`,
        ``,
        `No playbook for kind "${input.kind}" yet. Flagging for manual triage.`,
        `Draft prepared by scripted policy. Human review required.`,
      ].join("\n");

  const footnote = sourcesFootnote(input);
  return footnote ? `${body}\n\n${footnote}` : body;
}

// The honesty footnote: where every fact in the draft came from, straight
// from the ingest pipeline's provenance notes.
function sourcesFootnote(input: DraftInput): string {
  if (input.provenance.length === 0) return "";

  const lines = new Set<string>();
  for (const note of input.provenance) {
    lines.add(note.detail ? `${note.source} (${note.detail})` : note.source);
  }

  return ["Sources:", ...[...lines].map(line => `  - ${line}`)].join("\n");
}

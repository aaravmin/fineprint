// Zero-LLM drafting policy (DEFAULT). The demo must work with no API keys.
import {
  projectFines,
  projectRetrofit,
  renderCliffTable,
  renderRetrofitLines,
} from "../projections.ts";
import type { DraftInput } from "./types.ts";

const TEMPLATES: Record<string, (i: DraftInput) => string> = {
  emissions_fine_analysis: input =>
    [
      `LL97 EXPOSURE ANALYSIS · ${input.address}`,
      ``,
      ...(input.annualEmissionsTco2e !== undefined
        ? [
            `Reported annual emissions: ${input.annualEmissionsTco2e.toLocaleString()} tCO2e.`,
          ]
        : []),
      `Estimated annual penalty: $${fmt(input.fineEstimateUsd)} ($268 per tCO2e over cap).`,
      ...cliffTableLines(input),
      ...retrofitLines(input),
      `Recommended sequence:`,
      `  1. Pull 24 months of utility data; verify against LL84 benchmarking submission.`,
      `  2. Commission energy model to size the overage before paying a dollar of fines.`,
      `  3. Price the gap closers: BMS scheduling fixes, heating plant controls, LED completion.`,
      `  4. If overage persists, evaluate Good Faith Efforts filing to defer penalties.`,
    ].join("\n"),
  prescriptive_measures_plan: input =>
    [
      `ARTICLE 321 COMPLIANCE PLAN · ${input.address}`,
      ``,
      `Building qualifies for the affordable-housing pathway: implement the prescriptive`,
      `measures list instead of meeting the emissions cap.`,
      ...art321TargetLines(input),
      `  1. Confirm eligibility documentation with HPD records.`,
      `  2. Schedule the 13 prescriptive measures survey (controls, insulation, low-flow).`,
      `  3. File certification of completed measures before the deadline.`,
    ].join("\n"),
  benchmarking_filing: input =>
    [
      `LL84 BENCHMARKING FILING · ${input.address}`,
      ``,
      `Annual energy and water benchmarking due. Exposure if missed: $${fmt(input.fineEstimateUsd)}/yr.`,
      `  1. Confirm ESPM property profile is current (sqft: ${input.sqft.toLocaleString()}).`,
      `  2. Request whole-building aggregate data from utilities.`,
      `  3. Submit through the NYC portal; archive the confirmation number.`,
    ].join("\n"),
  audit_filing: input =>
    [
      `LL87 AUDIT & RETRO-COMMISSIONING · ${input.address}`,
      ``,
      `Energy audit + RCx filing cycle is due. Exposure if missed: $${fmt(input.fineEstimateUsd)}.`,
      `  1. Engage a registered energy auditor (ASHRAE Level II).`,
      `  2. Complete retro-commissioning checklist on base building systems.`,
      `  3. File EER through DOB NOW before the deadline.`,
    ].join("\n"),
  facade_inspection: input =>
    [
      `LL11 / FISP FACADE CYCLE · ${input.address}`,
      ``,
      `Facade inspection filing window is open. Failure-to-file exposure: $${fmt(input.fineEstimateUsd)}/yr.`,
      `  1. Retain a QEWI (Qualified Exterior Wall Inspector).`,
      `  2. Schedule close-up inspection; budget sidewalk shed only if unsafe conditions found.`,
      `  3. File SWARMP or Safe report in DOB NOW: Safety.`,
    ].join("\n"),
  lighting_submetering_plan: input =>
    [
      `LL88 LIGHTING & SUBMETERING · ${input.address}`,
      ``,
      `Lighting code upgrade + tenant submetering required by deadline.`,
      `  1. Survey non-compliant fixtures against NYCECC lighting standards.`,
      `  2. Identify tenant spaces over 5,000 sqft lacking submeters.`,
      `  3. Stage installs with tenant turnover to cut cost; file compliance report.`,
    ].join("\n"),
  gas_piping_certification: input =>
    [
      `LL152 GAS PIPING CERTIFICATION · ${input.address}`,
      ``,
      `Periodic gas piping inspection is due this community district cycle.`,
      `Failure-to-certify exposure: $${fmt(input.fineEstimateUsd)}.`,
      `  1. Retain a licensed master plumber (LMP) to inspect all exposed gas piping.`,
      `  2. Correct any unsafe or hazardous conditions found; document the repairs.`,
      `  3. File the GPS2 certification through DOB NOW before the cycle deadline.`,
      `  4. Calendar the next cycle; certification recurs every four years.`,
    ].join("\n"),
  energy_grade_posting: input =>
    [
      `LL33 ENERGY GRADE POSTING · ${input.address}`,
      ``,
      `The building's energy label must be posted near every public entrance.`,
      `Failure-to-post exposure: $${fmt(input.fineEstimateUsd)}.`,
      `  1. Confirm the LL84 benchmarking filing is in — the grade rides on its ENERGY STAR score.`,
      `  2. Download the current label from DOB when grades are issued in October.`,
      `  3. Post the label within 30 days at each public entrance; photograph the posting.`,
      `  4. Calendar the annual refresh; last year's label does not carry over.`,
    ].join("\n"),
  mold_pest_remediation: input =>
    [
      `LL55 INDOOR ALLERGEN HAZARDS · ${input.address}`,
      ``,
      `Annual mold and pest duties apply to this residential building.`,
      `  1. Triage open HPD complaints for mold and pest conditions; inspect units yearly.`,
      `  2. Remediate using tenant-safe practices (HPD-approved methods, no tenant in unit).`,
      `  3. Fix the underlying condition: a leak behind recurring mold, entry points behind pests.`,
      `  4. Keep records of inspections and remediation for HPD review.`,
    ].join("\n"),
};

function fmt(amount: number | undefined): string {
  return amount === undefined ? "TBD" : amount.toLocaleString();
}

// The engine's three-period projection, ready to splice into a template.
// Empty when the building lacks emissions or use data.
function cliffTableLines(input: DraftInput): string[] {
  const projections = projectFines(input);
  if (!projections) return [];

  return ["", renderCliffTable(projections), ""];
}

// The optimizer's pick, with the assumptions disclaimer carried in the lines.
// Compliant buildings (empty best plan) get nothing.
function retrofitLines(input: DraftInput): string[] {
  const assessment = projectRetrofit(input);
  if (!assessment) return [];

  const lines = renderRetrofitLines(assessment);
  return lines.length > 0 ? [...lines, ""] : [];
}

export function draftScripted(input: DraftInput): string {
  const template = TEMPLATES[input.kind];
  const body = template
    ? template(input)
    : [
        `COMPLIANCE DRAFT · ${input.title}`,
        ``,
        `No playbook for kind "${input.kind}" yet. Flagging for manual triage.`,
      ].join("\n");

  return [body, deadlineLine(input), sourcesFootnote(input)].filter(Boolean).join("\n\n");
}

function deadlineLine(input: DraftInput): string {
  if (!input.deadline) return "";

  const date = input.deadline.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `Deadline: ${date}`;
}

// The engine's 2030 limit is the Article 321 performance target
// (Admin Code 28-321.2.1); state it when the building data allows.
function art321TargetLines(input: DraftInput): string[] {
  const projections = projectFines(input);
  if (!projections || projections[0].pathway !== "article321") return [];

  const target = projections[0].emissionsLimitTco2e.toLocaleString("en-US");
  const current =
    input.annualEmissionsTco2e !== undefined
      ? ` (currently ${input.annualEmissionsTco2e.toLocaleString("en-US")} tCO2e)`
      : "";
  return [``, `2030 emissions target: ${target} tCO2e${current}.`];
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

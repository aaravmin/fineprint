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
      ...systemDriverLines(input),
      ...measureHighlightLines(input),
      ...cliffTableLines(input),
      ...retrofitLines(input),
      `Recommended sequence:`,
      `  1. Pull 24 months of utility data; verify against the energy benchmarking submission.`,
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
};

function fmt(amount: number | undefined): string {
  return amount === undefined ? "TBD" : amount.toLocaleString();
}

// The building's own emissions drivers, biggest share first, from the persisted
// systems dossier. This is what makes two same-size buildings read differently:
// a failing 1995 oil boiler leads here, an all-electric plant does not. Empty
// for seed buildings and rows ingested before the dossier existed.
function systemDriverLines(input: DraftInput): string[] {
  if (input.systemDrivers.length === 0) {
    return [];
  }

  const lines = input.systemDrivers.map(driver => {
    const condition =
      driver.condition && driver.condition !== "unknown"
        ? ` (${driver.condition.replace(/_/g, " ")})`
        : "";
    const share =
      driver.shareOfEmissions !== null
        ? ` - ${Math.round(driver.shareOfEmissions * 100)}% of emissions`
        : "";
    return `  - ${driver.headline}${condition}${share}`;
  });

  return ["", "Emissions drivers (from this building's public record):", ...lines];
}

// The building's top personalized measures - the ones that reach the optimizer,
// with their real cost, building-specific cut, and evidence-cited reason. Empty
// when the plan carries no personalization (seed or pre-dossier rows).
function measureHighlightLines(input: DraftInput): string[] {
  if (input.measureHighlights.length === 0) {
    return [];
  }

  const lines = input.measureHighlights.map(measure => {
    const capex =
      measure.capexUsd !== null
        ? `$${Math.round(measure.capexUsd).toLocaleString("en-US")} capex`
        : "capex to be priced";
    const cut =
      measure.estReductionTco2e !== null
        ? `cuts ~${measure.estReductionTco2e.toLocaleString("en-US")} tCO2e/yr`
        : "cut not yet priced";
    return `  - ${measure.name}: ${capex}, ${cut}. ${measure.why}`;
  });

  return ["", "Building-specific measures (capex assumptions, not quotes):", ...lines];
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

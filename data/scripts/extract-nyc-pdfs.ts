// Phase 3 entry point: extract measure-level retrofit cost tables from the three
// NYC cost PDFs in data/nyc_cost_sources/ into the normalized cost-table file.
//
//   npm run extract:nyc-pdfs
//
// The values below are transcribed directly from the cited tables (located with
// `pdftotext -layout` and verifiable per page with `pdftotext -f N -l N`). Only
// figures the source states as costs are included — never a narrative aside, and
// never the energy-loss dollars that one table reports (see SKIPPED below).
// Every measure carries its source PDF and page; anything the table does not give
// stays null.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ELECTRIFICATION = "NY-Building-Electrification-Cost-Full-Report-June2022.pdf";
const STEAM = "2019.02.12_demystifying_steam_report.pdf";
const ROOF = "spending-through-the-roof.pdf";

// Phase 3 cost-table schema (a focused subset of the shared measure schema).
interface NycCostMeasure {
  measure_name: string;
  building_type: string | null;
  cost_low: number | null;
  cost_mid: number | null;
  cost_high: number | null;
  cost_unit: string | null;
  energy_savings: number | null;
  carbon_savings: number | null;
  lifetime_years: number | null;
  source_pdf: string;
  page_number: number;
  notes: string | null;
}

interface Provenance {
  unit: string;
  pdf: string;
  page: number;
  notes: string;
}

// A measure whose source gives a low-to-high range (cost_mid stays null).
function range(
  name: string,
  buildingType: string,
  low: number,
  high: number,
  p: Provenance,
): NycCostMeasure {
  return base(name, buildingType, low, null, high, p);
}

// A measure whose source gives a single point estimate (in cost_mid).
function point(
  name: string,
  buildingType: string,
  value: number,
  p: Provenance,
): NycCostMeasure {
  return base(name, buildingType, null, value, null, p);
}

// A point estimate the source brackets with a +/- band (becomes low/high).
function plusMinus(
  name: string,
  buildingType: string,
  mid: number,
  band: number,
  p: Provenance,
): NycCostMeasure {
  return base(name, buildingType, mid - band, mid, mid + band, p);
}

function base(
  name: string,
  buildingType: string,
  low: number | null,
  mid: number | null,
  high: number | null,
  p: Provenance,
): NycCostMeasure {
  return {
    measure_name: name,
    building_type: buildingType,
    cost_low: low,
    cost_mid: mid,
    cost_high: high,
    cost_unit: p.unit,
    // These cost tables state capital cost only; savings appear as $/SF or
    // payback (kept in notes), never as the energy or carbon units this field
    // would imply, and never as equipment lifetime.
    energy_savings: null,
    carbon_savings: null,
    lifetime_years: null,
    source_pdf: p.pdf,
    page_number: p.page,
    notes: p.notes,
  };
}

// RCG = Rosen Consulting Group, the report's own synthesized New York estimate.
const sfHome = (page: number, notes: string): Provenance => ({
  unit: "2022 USD, total per single-family home",
  pdf: ELECTRIFICATION,
  page,
  notes: `RCG synthesized New York estimate, 2022. ${notes}`,
});
const mfUnit = (page: number, notes: string): Provenance => ({
  unit: "2022 USD, total per dwelling unit",
  pdf: ELECTRIFICATION,
  page,
  notes: `RCG synthesized New York estimate, 2022. ${notes}`,
});
const officeSqft = (notes: string): Provenance => ({
  unit: "2021 USD per ft² gross floor area",
  pdf: ELECTRIFICATION,
  page: 14,
  notes: `E3 Integration Analysis 2021 (New York), as reported. ${notes}`,
});
const steam6a = (notes: string): Provenance => ({
  unit: "2019 USD, total capital cost per building",
  pdf: STEAM,
  page: 28,
  notes: `Urban Green "Demystifying Steam" Table 6A (Distribution Improvements Package). ${notes}`,
});
const steam6b = (notes: string): Provenance => ({
  unit: "2019 USD, incremental capital cost per building vs like-for-like boiler",
  pdf: STEAM,
  page: 29,
  notes:
    'Urban Green "Demystifying Steam" Table 6B (Boiler Replacement Package). Negative = savings from right-sizing to a smaller boiler. ' +
    notes,
});
const roofVent = (notes: string): Provenance => ({
  unit: "USD per building",
  pdf: ROOF,
  page: 17,
  notes: `Urban Green "Spending Through the Roof", radiator-vent heat-loss control option. ${notes}`,
});

const MEASURES: NycCostMeasure[] = [
  // --- Electrification report: single-family (pp. 9-11) ---
  range(
    "Whole-home electrification, air-source heat pump",
    "Residential — single family",
    17_400,
    31_700,
    sfHome(
      9,
      "Full appliance set (heat pump/AC, heat-pump water heater, cooktop, clothes dryer) plus electrical modifications.",
    ),
  ),
  range(
    "Whole-home electrification, ground-source heat pump",
    "Residential — single family",
    28_400,
    50_500,
    sfHome(10, "Full appliance set plus electrical modifications; ground-source."),
  ),
  range(
    "Air-source heat pump and AC",
    "Residential — single family",
    13_000,
    20_000,
    sfHome(10, "Largest single component of a home retrofit."),
  ),
  range(
    "Ground-source heat pump and AC",
    "Residential — single family",
    24_000,
    38_800,
    sfHome(10, "Largest single component; ground-source."),
  ),
  range(
    "Heat-pump water heater",
    "Residential — single family",
    900,
    4_000,
    sfHome(11, "RCG Estimate row, appliance cost table."),
  ),
  range(
    "Electric / induction cooktop range",
    "Residential — single family",
    400,
    1_200,
    sfHome(11, "RCG Estimate row; $400 standard electric, up to $1,200 induction."),
  ),
  range(
    "Heat-pump clothes dryer",
    "Residential — single family",
    500,
    1_500,
    sfHome(11, "RCG Estimate row."),
  ),
  range(
    "Electrical service modifications",
    "Residential — single family",
    2_600,
    5_000,
    sfHome(11, "Panel/service upgrade and wiring for added electric loads."),
  ),

  // --- Electrification report: multifamily, per unit (p. 11) ---
  range(
    "Whole-unit electrification, air/water-source heat pump",
    "Residential — small multifamily (2-19 units)",
    13_000,
    30_100,
    mfUnit(11, "Per dwelling unit; full appliance set plus electrical modifications."),
  ),
  range(
    "Whole-unit electrification, air/water-source heat pump",
    "Residential — large multifamily (20+ units)",
    19_400,
    42_900,
    mfUnit(11, "Per dwelling unit; full appliance set plus electrical modifications."),
  ),
  range(
    "Whole-unit electrification, ground-source heat pump",
    "Residential — small multifamily (2-19 units)",
    29_600,
    42_900,
    mfUnit(11, "Per dwelling unit; ground-source."),
  ),
  range(
    "Whole-unit electrification, ground-source heat pump",
    "Residential — large multifamily (20+ units)",
    40_800,
    56_000,
    mfUnit(11, "Per dwelling unit; ground-source."),
  ),

  // --- Electrification report: office, per square foot (p. 14) ---
  point(
    "Building envelope, basic shell upgrade",
    "Commercial — office",
    16,
    officeSqft("Reference shell baseline is $4/ft²; basic shell upgrade."),
  ),
  point(
    "Building envelope, deep shell upgrade",
    "Commercial — office",
    28,
    officeSqft("Deep shell upgrade."),
  ),
  point(
    "Heat-pump water heater (office)",
    "Commercial — office",
    2,
    officeSqft("High-end estimate."),
  ),
  point(
    "Electrical and infrastructure upgrades (office)",
    "Commercial — office",
    0.4,
    officeSqft("Infrastructure/electrical upgrade for electrification."),
  ),

  // --- Electrification report: new construction (p. 14) ---
  range(
    "Whole-home electrification, new construction (incremental)",
    "Residential — single family (new construction)",
    12_000,
    23_000,
    {
      unit: "2022 USD, incremental total per single-family home",
      pdf: ELECTRIFICATION,
      page: 14,
      notes:
        "RCG synthesized New York estimate, 2022. Incremental construction cost vs a standard gas-powered new home; full appliance set plus electrical modifications.",
    },
  ),

  // --- Steam report: Table 6A, Distribution Improvements Package (p. 28) ---
  point(
    "Steam distribution improvements package",
    "Residential one-pipe steam (~5,000 ft²)",
    6_000,
    steam6a("Annual savings $0.13/ft² (gas) to $0.23/ft² (oil); simple payback 6-10 yr."),
  ),
  point(
    "Steam distribution improvements package",
    "Residential one-pipe steam (~50,000 ft²)",
    40_250,
    steam6a("Annual savings $0.09/ft² (gas) to $0.23/ft² (oil); simple payback 4-9 yr."),
  ),
  point(
    "Steam distribution improvements package",
    "Residential one-pipe steam (~200,000 ft²)",
    96_000,
    steam6a("Annual savings $0.08/ft² (gas) to $0.20/ft² (oil); simple payback 3-6 yr."),
  ),
  point(
    "Steam distribution improvements package",
    "Residential two-pipe steam (~5,000 ft²)",
    6_000,
    steam6a("Annual savings $0.16/ft² (gas) to $0.40/ft² (oil); simple payback 3-8 yr."),
  ),
  point(
    "Steam distribution improvements package",
    "Residential two-pipe steam (~50,000 ft²)",
    56_000,
    steam6a("Annual savings $0.09/ft² (gas) to $0.23/ft² (oil); simple payback 5-12 yr."),
  ),
  point(
    "Steam distribution improvements package",
    "Residential two-pipe steam (~200,000 ft²)",
    152_000,
    steam6a("Annual savings $0.09/ft² (gas) to $0.22/ft² (oil); simple payback 4-9 yr."),
  ),
  point(
    "Steam distribution improvements package",
    "Commercial two-pipe steam (~20,000 ft²)",
    9_750,
    steam6a("Annual savings $0.02/ft² (gas); simple payback 7 yr."),
  ),
  point(
    "Steam distribution improvements package",
    "Commercial two-pipe steam (~90,000 ft²)",
    97_500,
    steam6a("Annual savings $0.08/ft² (gas); simple payback 14 yr."),
  ),
  point(
    "Steam distribution improvements package",
    "Commercial two-pipe steam (~250,000 ft²)",
    186_000,
    steam6a(
      "Annual savings $0.08/ft² (gas) to $0.26/ft² (district steam); simple payback 3-9 yr.",
    ),
  ),

  // --- Steam report: Table 6B, Boiler Replacement Package (p. 29) ---
  point(
    "Right-sized steam boiler replacement",
    "Residential one-pipe steam (~5,000 ft²)",
    -5_750,
    steam6b("Annual savings $0.09/ft² (gas) to $0.15/ft² (oil); immediate payback."),
  ),
  plusMinus(
    "Right-sized steam boiler replacement",
    "Residential one-pipe steam (~50,000 ft²)",
    -12_000,
    500,
    steam6b("Annual savings $0.04/ft² (gas) to $0.09/ft² (oil)."),
  ),
  plusMinus(
    "Right-sized steam boiler replacement",
    "Residential one-pipe steam (~200,000 ft²)",
    -39_250,
    4_000,
    steam6b("Annual savings $0.02/ft² (gas) to $0.06/ft² (oil)."),
  ),
  point(
    "Right-sized steam boiler replacement",
    "Residential two-pipe steam (~5,000 ft²)",
    -5_750,
    steam6b("Annual savings $0.12/ft² (gas) to $0.30/ft² (oil)."),
  ),
  plusMinus(
    "Right-sized steam boiler replacement",
    "Residential two-pipe steam (~50,000 ft²)",
    -12_000,
    500,
    steam6b("Annual savings $0.03/ft² (gas) to $0.08/ft² (oil)."),
  ),
  plusMinus(
    "Right-sized steam boiler replacement",
    "Residential two-pipe steam (~200,000 ft²)",
    -39_250,
    4_000,
    steam6b("Annual savings $0.03/ft² (gas) to $0.08/ft² (oil)."),
  ),
  point(
    "Right-sized steam boiler replacement",
    "Commercial two-pipe steam (~20,000 ft²)",
    500,
    steam6b("Annual savings $0.01/ft² (gas)."),
  ),
  plusMinus(
    "Right-sized steam boiler replacement",
    "Commercial two-pipe steam (~90,000 ft²)",
    -12_000,
    500,
    steam6b("Annual savings $0.02/ft² (gas)."),
  ),
  plusMinus(
    "Right-sized steam boiler replacement",
    "Commercial two-pipe steam (~250,000 ft²)",
    -39_250,
    4_000,
    steam6b("Annual savings $0.02/ft² (gas) to $0.07/ft² (district steam)."),
  ),

  // --- Spending Through the Roof: radiator-vent heat-loss control (p. 17) ---
  range(
    "Cover radiator vents with storm/annealed glass",
    "Multifamily steam-heated (any size)",
    500,
    2_000,
    roofVent(
      "Covers ~2/3 of vents; in-house installable; best for smaller, simpler buildings.",
    ),
  ),
  range(
    "Install mechanical damper on radiator vents",
    "Multifamily steam-heated (any size)",
    5_000,
    15_000,
    roofVent("Fully closes the vent; requires electrical power and wiring."),
  ),
];

// Tables present in these PDFs that were deliberately not turned into cost rows.
const SKIPPED: Array<{ table: string; pdf: string; page: number; reason: string }> = [
  {
    table: "Table A3-1, Impacts for Individual Representative Buildings",
    pdf: ROOF,
    page: 23,
    reason:
      "The dollar column is the cost of energy LOST through open vents, not the cost of a retrofit measure. Treating it as a measure cost would misrepresent the source.",
  },
  {
    table: "Table 6C, Both Distribution and Boiler Replacement Packages",
    pdf: STEAM,
    page: 30,
    reason:
      "6C is the combination of Tables 6A and 6B (both already extracted). Including it would double-count the same two measures.",
  },
  {
    table: "Per-study comparison tables (Navigant, RMI, E3, NYSERDA, etc.)",
    pdf: ELECTRIFICATION,
    page: 10,
    reason:
      "These rows are other organizations' estimates the report aggregates. Only the report's own synthesized RCG New York estimate is extracted, to avoid double-counting the same underlying studies.",
  },
];

const FIELDS: Array<keyof NycCostMeasure> = [
  "measure_name",
  "building_type",
  "cost_low",
  "cost_mid",
  "cost_high",
  "cost_unit",
  "energy_savings",
  "carbon_savings",
  "lifetime_years",
  "source_pdf",
  "page_number",
  "notes",
];

function validate(measures: NycCostMeasure[]): string[] {
  const problems: string[] = [];
  measures.forEach((measure, index) => {
    for (const field of FIELDS) {
      if (!(field in measure)) {
        problems.push(
          `measure ${index} (${measure.measure_name}) missing field ${field}`,
        );
      }
    }
    if (!measure.source_pdf || !measure.page_number) {
      problems.push(
        `measure ${index} (${measure.measure_name}) lacks source_pdf or page_number`,
      );
    }
    const hasCost =
      measure.cost_low !== null ||
      measure.cost_mid !== null ||
      measure.cost_high !== null;
    if (!hasCost) {
      problems.push(
        `measure ${index} (${measure.measure_name}) has no cost value at all`,
      );
    }
  });
  return problems;
}

function coverage(measures: NycCostMeasure[]): { mapped: string[]; missing: string[] } {
  const mapped = new Set<string>();
  for (const measure of measures) {
    for (const field of FIELDS) {
      if (measure[field] !== null) {
        mapped.add(field);
      }
    }
  }
  return { mapped: [...mapped], missing: FIELDS.filter(field => !mapped.has(field)) };
}

function renderReport(measures: NycCostMeasure[]): string {
  const { mapped, missing } = coverage(measures);
  const byPdf = new Map<string, number>();
  for (const measure of measures) {
    byPdf.set(measure.source_pdf, (byPdf.get(measure.source_pdf) ?? 0) + 1);
  }
  const list = (items: string[]) =>
    items.length > 0 ? items.map(i => `- ${i}`).join("\n") : "- (none)";

  return `# NYC retrofit cost PDF extraction report

_Generated by \`npm run extract:nyc-pdfs\`. Values transcribed from the cited
tables (located with \`pdftotext -layout\`); re-verify any page with
\`pdftotext -f N -l N <pdf>\`._

## PDFs inspected

- \`${ELECTRIFICATION}\` (22 pp.) — measure cost tables on pp. 9-14
- \`${STEAM}\` (36 pp.) — Tables 6A/6B retrofit case-study costs on pp. 28-29
- \`${ROOF}\` (27 pp.) — radiator-vent control costs on p. 17

## Measures extracted

- Total: **${measures.length}**
${[...byPdf.entries()].map(([pdf, n]) => `- \`${pdf}\`: ${n}`).join("\n")}

## Field mapping

Fields populated for at least one measure:

${list(mapped)}

Fields null across every measure:

${list(missing)}

## Skipped tables and why

${SKIPPED.map(s => `- **${s.table}** (\`${s.pdf}\`, p. ${s.page}): ${s.reason}`).join("\n")}

## Notes and assumptions

- Costs are capital costs as the tables state them. Where a table gives only a
  range, cost_mid is null; where it gives a single point, cost_low/high are null;
  a +/- band fills cost_low/high around cost_mid.
- Steam Table 6B costs are *incremental* (vs a like-for-like boiler) and are often
  negative because right-sizing to a smaller boiler costs less than replacement.
- energy_savings, carbon_savings, and lifetime_years are null throughout: these
  tables report savings as $/ft² or simple payback (kept in notes), not energy,
  carbon, or equipment lifetime. Savings come from ResStock/REMDB downstream.
- Only the electrification report's own RCG New York estimates are taken from its
  comparison tables, to avoid double-counting the underlying studies.
`;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outPath = join(repoRoot, "data", "normalized", "nyc_retrofit_cost_tables.json");
const reportPath = join(repoRoot, "data", "normalized", "nyc_pdf_extract_report.md");

function main(): void {
  const problems = validate(MEASURES);
  if (problems.length > 0) {
    console.error("Validation failed:\n" + problems.map(p => `  - ${p}`).join("\n"));
    process.exitCode = 1;
    return;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(MEASURES, null, 2)}\n`);
  writeFileSync(reportPath, renderReport(MEASURES));

  console.log(`Wrote ${MEASURES.length} cost measures to ${outPath}`);
  console.log(`Wrote extraction report to ${reportPath}`);
}

main();

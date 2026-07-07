// Phase 5 entry point: merge the three normalized sources into one master
// retrofit-measure file.
//
//   npm run merge:measures
//
// Source priority follows the roadmap: cost comes from the NYC-specific PDFs
// first, then REMDB; residential energy and utility savings come from ResStock.
// Nothing is invented — every cost and savings number is pulled from a loaded
// source row, and every contributing source is preserved on the measure. The
// only curation here is the mapping (which source rows describe the same
// measure), declared explicitly in CATALOG below.
//
// Measures are kept separate from laws: a measure lists the law_ids it can help
// satisfy (supports_law_ids), but it is never itself a law.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { emptyMeasure, type NormalizedMeasure } from "../src/normalized/measureSchema.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataDir = join(repoRoot, "data");
const outPath = join(dataDir, "normalized", "measure_cost_savings_master.json");
const reportPath = join(dataDir, "normalized", "measure_master_merge_report.md");

// --- loaded source shapes ----------------------------------------------------

interface RemdbRow extends NormalizedMeasure {}
interface NycRow {
  measure_name: string;
  building_type: string | null;
  cost_low: number | null;
  cost_mid: number | null;
  cost_high: number | null;
  cost_unit: string | null;
  source_pdf: string;
  page_number: number;
  notes: string | null;
}
interface ResstockCurve {
  upgrade_id: number;
  upgrade_name: string;
  buildings_applicable: number;
  annual_energy_savings_kwh: { p25: number; median: number; p75: number } | null;
  annual_utility_cost_savings_usd: { p25: number; median: number; p75: number } | null;
  affected_end_uses: string[];
  applicable_building_types: string[];
}

const remdb: RemdbRow[] = JSON.parse(
  readFileSync(join(dataDir, "remdb", "remdb_measures.json"), "utf8"),
);
const nyc: NycRow[] = JSON.parse(
  readFileSync(join(dataDir, "normalized", "nyc_retrofit_cost_tables.json"), "utf8"),
);
const resstock: ResstockCurve[] = JSON.parse(
  readFileSync(join(dataDir, "normalized", "resstock_upgrade_curves.json"), "utf8"),
);

const remdbById = new Map(remdb.map(row => [row.measure_id, row]));
const resstockById = new Map(resstock.map(curve => [curve.upgrade_id, curve]));

// --- canonical catalog (the mapping; values still come from the sources) -----

interface CatalogEntry {
  id: string;
  name: string;
  category: string;
  applies_to_residential: boolean;
  applies_to_commercial: boolean | null;
  // Cost sources, tried in priority order: NYC PDF measure names, then REMDB ids.
  cost_nyc_names: string[];
  cost_remdb_ids: string[];
  // ResStock upgrade whose savings curve describes this measure.
  resstock_upgrade: number | null;
  supports_law_ids: string[];
  note: string;
}

const CATALOG: CatalogEntry[] = [
  {
    id: "air_source_heat_pump",
    name: "Air-source heat pump (cold climate)",
    category: "Heating & cooling",
    applies_to_residential: true,
    applies_to_commercial: null,
    cost_nyc_names: ["Air-source heat pump and AC"],
    cost_remdb_ids: ["remdb:air_source_heat_pump_centrally_ducted"],
    resstock_upgrade: 4,
    supports_law_ids: ["ll97", "ll87"],
    note: "Cost is the single-family heat-pump/AC line; savings from the cold-climate ducted ASHP upgrade.",
  },
  {
    id: "ground_source_heat_pump",
    name: "Ground-source (geothermal) heat pump",
    category: "Heating & cooling",
    applies_to_residential: true,
    applies_to_commercial: null,
    cost_nyc_names: ["Ground-source heat pump and AC"],
    cost_remdb_ids: ["remdb:ground_source_heat_pump_gshp"],
    resstock_upgrade: 7,
    supports_law_ids: ["ll97", "ll87"],
    note: "Savings from the dual-speed geothermal upgrade (representative of ResStock geothermal variants 6/7/8).",
  },
  {
    id: "heat_pump_water_heater",
    name: "Heat-pump water heater",
    category: "Water heating",
    applies_to_residential: true,
    applies_to_commercial: null,
    cost_nyc_names: ["Heat-pump water heater"],
    cost_remdb_ids: ["remdb:water_heater_hp_tank"],
    resstock_upgrade: 9,
    supports_law_ids: ["ll97"],
    note: "",
  },
  {
    id: "gas_tankless_water_heater",
    name: "High-efficiency gas tankless water heater",
    category: "Water heating",
    applies_to_residential: true,
    applies_to_commercial: null,
    cost_nyc_names: [],
    cost_remdb_ids: ["remdb:water_heater_gas_inst"],
    resstock_upgrade: 10,
    supports_law_ids: ["ll97"],
    note: "Efficiency measure, not electrification; cost from REMDB (no NYC-specific figure).",
  },
  {
    id: "gas_furnace_95_afue",
    name: "95% AFUE natural gas furnace",
    category: "Heating & cooling",
    applies_to_residential: true,
    applies_to_commercial: null,
    cost_nyc_names: [],
    cost_remdb_ids: ["remdb:furnaces_gas_furnace"],
    resstock_upgrade: 1,
    supports_law_ids: ["ll97"],
    note: "Efficiency upgrade for gas-heated homes with ducts.",
  },
  {
    id: "air_sealing",
    name: "Envelope air sealing",
    category: "Envelope",
    applies_to_residential: true,
    applies_to_commercial: null,
    cost_nyc_names: [],
    cost_remdb_ids: [
      "remdb:air_sealing_40_reduction",
      "remdb:air_sealing_40_reduction_2",
    ],
    resstock_upgrade: 11,
    supports_law_ids: ["ll97", "ll87"],
    note: "Cost aggregates REMDB's <40% and >40% leakage-reduction rows ($/sqft).",
  },
  {
    id: "attic_floor_insulation",
    name: "Attic floor insulation",
    category: "Envelope",
    applies_to_residential: true,
    applies_to_commercial: null,
    cost_nyc_names: [],
    cost_remdb_ids: ["remdb:unfinished_attic_ceiling_loose_fill"],
    resstock_upgrade: 12,
    supports_law_ids: ["ll97"],
    note: "Cost from REMDB loose-fill attic ceiling insulation.",
  },
  {
    id: "duct_sealing_insulation",
    name: "Duct sealing and insulation",
    category: "Heating & cooling",
    applies_to_residential: true,
    applies_to_commercial: null,
    cost_nyc_names: [],
    cost_remdb_ids: ["remdb:duct_duct_sealing", "remdb:duct_duct_insulation"],
    resstock_upgrade: 13,
    supports_law_ids: ["ll97"],
    note: "Cost aggregates REMDB duct sealing and duct insulation.",
  },
  {
    id: "wall_insulation_drill_fill",
    name: "Drill-and-fill wall insulation",
    category: "Envelope",
    applies_to_residential: true,
    applies_to_commercial: null,
    cost_nyc_names: [],
    cost_remdb_ids: [],
    resstock_upgrade: 14,
    supports_law_ids: ["ll97"],
    note: "No cost source: REMDB has no cavity drill-and-fill row and the NYC PDFs have none, so cost stays null. Savings only.",
  },
  {
    id: "energy_star_windows",
    name: "ENERGY STAR window replacement",
    category: "Envelope",
    applies_to_residential: true,
    applies_to_commercial: null,
    cost_nyc_names: [],
    cost_remdb_ids: ["remdb:window_vinyl", "remdb:window_metal", "remdb:window_storm"],
    resstock_upgrade: 17,
    supports_law_ids: ["ll97"],
    note: "Cost aggregates REMDB vinyl, metal, and storm window rows.",
  },
  {
    id: "steam_distribution_improvements",
    name: "Steam distribution improvements package",
    category: "Heating & cooling",
    applies_to_residential: true,
    applies_to_commercial: true,
    cost_nyc_names: ["Steam distribution improvements package"],
    cost_remdb_ids: [],
    resstock_upgrade: null,
    supports_law_ids: ["ll97", "ll87"],
    note: "Cost spans the NYC PDF's building-size cases (per building). No ResStock savings (commercial/steam is outside the residential ResStock set).",
  },
  {
    id: "steam_boiler_right_sizing",
    name: "Right-sized steam boiler replacement",
    category: "Heating & cooling",
    applies_to_residential: true,
    applies_to_commercial: true,
    cost_nyc_names: ["Right-sized steam boiler replacement"],
    cost_remdb_ids: [],
    resstock_upgrade: null,
    supports_law_ids: ["ll97"],
    note: "Incremental cost vs like-for-like replacement (often negative). No ResStock savings.",
  },
  {
    id: "office_shell_upgrade",
    name: "Office building envelope (shell) upgrade",
    category: "Envelope",
    applies_to_residential: false,
    applies_to_commercial: true,
    cost_nyc_names: [
      "Building envelope, basic shell upgrade",
      "Building envelope, deep shell upgrade",
    ],
    cost_remdb_ids: [],
    resstock_upgrade: null,
    supports_law_ids: ["ll97", "ll87"],
    note: "Cost spans basic and deep shell ($/ft²). Commercial; no residential ResStock savings.",
  },
  {
    id: "radiator_vent_control",
    name: "Radiator vent heat-loss control",
    category: "Heating & cooling",
    applies_to_residential: true,
    applies_to_commercial: true,
    cost_nyc_names: [
      "Cover radiator vents with storm/annealed glass",
      "Install mechanical damper on radiator vents",
    ],
    cost_remdb_ids: [],
    resstock_upgrade: null,
    supports_law_ids: ["ll97"],
    note: "Cost spans the storm-glass and mechanical-damper options (per building).",
  },
];

// --- merge helpers -----------------------------------------------------------

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface CostBlock {
  cost_low: number | null;
  cost_mid: number | null;
  cost_high: number | null;
  cost_unit: string | null;
}

// Combine one or more cost rows into a single low/mid/high envelope. Lows take
// the minimum, highs the maximum, mid the median of the rows' mids; the overall
// min/max fall back to every stated value when a row gives only a point.
function aggregateCost(rows: CostBlock[]): CostBlock | null {
  const lows = rows.map(r => r.cost_low).filter(isNum);
  const mids = rows.map(r => r.cost_mid).filter(isNum);
  const highs = rows.map(r => r.cost_high).filter(isNum);
  const all = rows.flatMap(r => [r.cost_low, r.cost_mid, r.cost_high].filter(isNum));
  if (all.length === 0) {
    return null;
  }
  const units = [...new Set(rows.map(r => r.cost_unit).filter((u): u is string => !!u))];
  return {
    cost_low: lows.length ? Math.min(...lows) : Math.min(...all),
    cost_mid: mids.length ? median(mids) : null,
    cost_high: highs.length ? Math.max(...highs) : Math.max(...all),
    cost_unit: units.length === 1 ? units[0] : units.join(" | "),
  };
}

interface SourceRef {
  role: "cost" | "savings";
  source: "nyc_pdf" | "remdb" | "resstock";
  ref: string;
  original: Record<string, unknown>;
}

interface MasterMeasure extends NormalizedMeasure {
  cost_source: "nyc_pdf" | "remdb" | null;
  savings_source: "resstock" | null;
  supports_law_ids: string[];
  sources: SourceRef[];
}

interface MergeDecision {
  measure: string;
  cost: string;
  savings: string;
}

const decisions: MergeDecision[] = [];

function buildMeasure(entry: CatalogEntry): MasterMeasure {
  const measure = emptyMeasure(`master:${entry.id}`, entry.name) as MasterMeasure;
  measure.category = entry.category;
  measure.applies_to_residential = entry.applies_to_residential;
  measure.applies_to_commercial = entry.applies_to_commercial;
  measure.supports_law_ids = entry.supports_law_ids;
  measure.sources = [];

  // Cost: NYC PDF first, then REMDB.
  const nycRows = entry.cost_nyc_names.flatMap(name =>
    nyc.filter(row => row.measure_name === name),
  );
  const remdbRows = entry.cost_remdb_ids
    .map(id => remdbById.get(id))
    .filter((r): r is RemdbRow => !!r);

  let costDecision = "none (no cost source)";
  let lifetime: number | null = null;

  if (nycRows.length > 0) {
    const cost = aggregateCost(nycRows)!;
    Object.assign(measure, cost);
    measure.cost_source = "nyc_pdf";
    measure.confidence_level = "high"; // NYC-specific, local
    const first = nycRows[0];
    measure.source_name = "NYC retrofit cost PDFs (NYSERDA / Urban Green)";
    measure.source_file = first.source_pdf;
    measure.source_page = first.page_number;
    for (const row of nycRows) {
      measure.sources.push({
        role: "cost",
        source: "nyc_pdf",
        ref: `${row.source_pdf} p.${row.page_number} — ${row.building_type ?? ""}`.trim(),
        original: {
          cost_low: row.cost_low,
          cost_mid: row.cost_mid,
          cost_high: row.cost_high,
          cost_unit: row.cost_unit,
        },
      });
    }
    costDecision = `NYC PDF (${nycRows.length} row${nycRows.length > 1 ? "s" : ""})`;
  } else if (remdbRows.length > 0) {
    const cost = aggregateCost(remdbRows)!;
    Object.assign(measure, cost);
    measure.cost_source = "remdb";
    measure.confidence_level = "medium";
    measure.source_name = remdbRows[0].source_name;
    measure.source_file = remdbRows[0].source_file;
    measure.source_page = remdbRows[0].source_page;
    lifetime = median(remdbRows.map(r => r.lifetime_years).filter(isNum));
    for (const row of remdbRows) {
      measure.sources.push({
        role: "cost",
        source: "remdb",
        ref: row.measure_id,
        original: {
          cost_low: row.cost_low,
          cost_mid: row.cost_mid,
          cost_high: row.cost_high,
          cost_unit: row.cost_unit,
          lifetime_years: row.lifetime_years,
        },
      });
    }
    costDecision = `REMDB (${remdbRows.length} row${remdbRows.length > 1 ? "s" : ""}); no NYC-specific cost`;
  } else {
    measure.cost_source = null;
  }
  measure.lifetime_years = lifetime;

  // Savings: ResStock.
  let savingsDecision = "none (no residential ResStock curve)";
  const curve =
    entry.resstock_upgrade !== null
      ? resstockById.get(entry.resstock_upgrade)
      : undefined;
  if (curve) {
    measure.savings_source = "resstock";
    if (curve.annual_energy_savings_kwh) {
      measure.annual_energy_savings_low = curve.annual_energy_savings_kwh.p25;
      measure.annual_energy_savings_mid = curve.annual_energy_savings_kwh.median;
      measure.annual_energy_savings_high = curve.annual_energy_savings_kwh.p75;
    }
    if (curve.annual_utility_cost_savings_usd) {
      measure.annual_utility_savings_low = curve.annual_utility_cost_savings_usd.p25;
      measure.annual_utility_savings_mid = curve.annual_utility_cost_savings_usd.median;
      measure.annual_utility_savings_high = curve.annual_utility_cost_savings_usd.p75;
    }
    measure.sources.push({
      role: "savings",
      source: "resstock",
      ref: `ResStock upgrade ${curve.upgrade_id}: ${curve.upgrade_name}`,
      original: {
        buildings_applicable: curve.buildings_applicable,
        annual_energy_savings_kwh: curve.annual_energy_savings_kwh,
        annual_utility_cost_savings_usd: curve.annual_utility_cost_savings_usd,
        affected_end_uses: curve.affected_end_uses,
      },
    });
    if (!measure.cost_source) {
      measure.confidence_level = "medium"; // savings only, ResStock-grade
    }
    savingsDecision = `ResStock upgrade ${curve.upgrade_id} (energy + utility, ${curve.buildings_applicable} dwellings)`;
  } else {
    measure.savings_source = null;
    if (!measure.cost_source) {
      measure.confidence_level = "low";
    }
  }

  const noteParts = [entry.note].filter(Boolean);
  noteParts.push(`Cost source: ${costDecision}. Savings source: ${savingsDecision}.`);
  measure.notes = noteParts.join(" ");

  decisions.push({ measure: entry.name, cost: costDecision, savings: savingsDecision });
  return measure;
}

// --- run ---------------------------------------------------------------------

const master = CATALOG.map(buildMeasure);

const duplicateNames = (() => {
  const counts = new Map<string, number>();
  for (const m of master) {
    counts.set(m.measure_name, (counts.get(m.measure_name) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name);
})();

const missingCost = master.filter(m => m.cost_source === null).map(m => m.measure_name);
const missingSavings = master
  .filter(m => m.savings_source === null)
  .map(m => m.measure_name);

function renderReport(): string {
  const list = (items: string[]) =>
    items.length ? items.map(i => `- ${i}`).join("\n") : "- (none)";
  return `# Master retrofit measure merge report

_Generated by \`npm run merge:measures\`._

## Sources loaded

- REMDB measures loaded: **${remdb.length}**
- NYC PDF cost rows loaded: **${nyc.length}**
- ResStock upgrade curves loaded: **${resstock.length}**

## Master measures

- Final master measures created: **${master.length}**
- Duplicate measure names: ${duplicateNames.length ? duplicateNames.join(", ") : "**none**"}
- Cost from NYC PDF: **${master.filter(m => m.cost_source === "nyc_pdf").length}**
- Cost from REMDB: **${master.filter(m => m.cost_source === "remdb").length}**
- Savings from ResStock: **${master.filter(m => m.savings_source === "resstock").length}**

## Source-priority decisions (per measure)

${decisions.map(d => `- **${d.measure}** — cost: ${d.cost}; savings: ${d.savings}`).join("\n")}

## Fields still missing

Measures with no cost source (cost left null, not invented):

${list(missingCost)}

Measures with no savings source (residential ResStock has no matching curve):

${list(missingSavings)}

## Fallback assumptions used

- (none) — no generic fallback values were used. Where neither a NYC PDF nor a
  REMDB cost exists, cost is left null rather than fabricated.

## Notes

- Cost priority is NYC-specific PDF, then REMDB; residential savings come from
  ResStock. Every contributing source is preserved on each measure's \`sources\`.
- carbon_savings is null throughout: it requires per-fuel emission factors not in
  these sources, and is left to be derived downstream rather than invented.
- Measures reference laws via \`supports_law_ids\` only; no law definitions live in
  this file.
`;
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(master, null, 2)}\n`);
writeFileSync(reportPath, renderReport());

// Emit a client-importable module so the compliance report can show real
// Phase 5 cost ranges + savings without the client reaching into data/.
const clientModulePath = join(
  repoRoot,
  "client",
  "src",
  "lib",
  "output",
  "masterMeasures.ts",
);
const clientMeasures = master.map(m => ({
  measure_id: m.measure_id,
  measure_name: m.measure_name,
  category: m.category,
  cost_low: m.cost_low,
  cost_mid: m.cost_mid,
  cost_high: m.cost_high,
  cost_unit: m.cost_unit,
  annual_energy_savings_mid: m.annual_energy_savings_mid,
  annual_utility_savings_mid: m.annual_utility_savings_mid,
  lifetime_years: m.lifetime_years,
  supports_law_ids: m.supports_law_ids,
  confidence_level: m.confidence_level,
  cost_source: m.cost_source,
  savings_source: m.savings_source,
}));
const clientModule = `// Generated by \`npm run merge:measures\` from data/normalized/measure_cost_savings_master.json.
// Do not edit by hand — re-run the merge to refresh. Lets the compliance report
// show real Phase 5 cost ranges and savings without the client reading data/.

export interface MasterMeasure {
  measure_id: string;
  measure_name: string;
  category: string | null;
  cost_low: number | null;
  cost_mid: number | null;
  cost_high: number | null;
  cost_unit: string | null;
  annual_energy_savings_mid: number | null;
  annual_utility_savings_mid: number | null;
  lifetime_years: number | null;
  supports_law_ids: string[];
  confidence_level: string | null;
  cost_source: "nyc_pdf" | "remdb" | null;
  savings_source: "resstock" | null;
}

export const MASTER_MEASURES: MasterMeasure[] = ${JSON.stringify(clientMeasures, null, 2)};
`;
mkdirSync(dirname(clientModulePath), { recursive: true });
writeFileSync(clientModulePath, clientModule);

console.log(`Wrote ${master.length} master measures to ${outPath}`);
console.log(`Wrote merge report to ${reportPath}`);
console.log(`Wrote client module to ${clientModulePath.replace(repoRoot + "/", "")}`);

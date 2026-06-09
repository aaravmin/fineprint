// Phase 4 entry point: turn the ResStock NY End-Use Savings Shapes files into
// per-upgrade savings curves.
//
//   npm run parse:resstock
//
// The NY_upgrade*.csv.gz files are actually gzipped TAR archives (a single .csv
// member behind a 512-byte tar header), so we stream gunzip -> in-archive tar
// extraction -> a quote-aware CSV reader, never unzipping to disk. ResStock
// publishes a per-building savings column for each upgrade (savings vs the
// Baseline scenario it was run against), so the baseline join the roadmap
// describes is already done in the data; we read that column directly. A naive
// comma split misaligns columns (some fields are quoted and contain commas), so
// the CSV parser below is quote-aware.

import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StringDecoder } from "node:string_decoder";
import { createGunzip } from "node:zlib";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const resstockDir = join(repoRoot, "data", "nrel", "resstock");
const outPath = join(repoRoot, "data", "normalized", "resstock_upgrade_curves.json");
const reportPath = join(repoRoot, "data", "normalized", "resstock_parse_report.md");

const CLIMATE_ZONE = "4A";
const CLIMATE_ZONE_COL = "in.ashrae_iecc_climate_zone_2004";
const BUILDING_TYPE_COL = "in.geometry_building_type_recs";
const ENERGY_SAVINGS_COL = "out.site_energy.total.energy_savings..kwh";
const BILL_SAVINGS_COL = "out.utility_bills.total_bill_savings..usd";
// An end use counts as "affected" when its net savings is at least this share of
// the upgrade's total absolute end-use savings.
const END_USE_SHARE_THRESHOLD = 0.05;

// --- quote-aware CSV ---------------------------------------------------------

// Parse a CSV line into fields, honoring double-quoted fields with embedded
// commas and "" escapes. Stops early once maxFields are parsed (we only need
// columns up to the bill-savings index, not all 771).
function parseCsvLine(line: string, maxFields = Number.POSITIVE_INFINITY): string[] {
  const fields: string[] = [];
  let value = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        value += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(value);
      value = "";
      if (fields.length >= maxFields) {
        return fields;
      }
    } else {
      value += ch;
    }
  }
  fields.push(value);
  return fields;
}

// --- gzip + tar streaming ----------------------------------------------------

// Stream the single CSV member out of a gzipped tar, line by line. The first 512
// bytes are the tar header; the member's byte length lives at octal offset 124.
async function forEachCsvLine(filePath: string, onLine: (line: string) => void): Promise<void> {
  const gunzip = createReadStream(filePath).pipe(createGunzip());
  const decoder = new StringDecoder("utf8");

  let header = Buffer.alloc(0);
  let headerParsed = false;
  let bytesRemaining = 0;
  let lineBuffer = "";

  const flushLines = (text: string, last: boolean) => {
    lineBuffer += text;
    let newline = lineBuffer.indexOf("\n");
    while (newline >= 0) {
      onLine(lineBuffer.slice(0, newline));
      lineBuffer = lineBuffer.slice(newline + 1);
      newline = lineBuffer.indexOf("\n");
    }
    if (last && lineBuffer.length > 0) {
      onLine(lineBuffer);
      lineBuffer = "";
    }
  };

  for await (const chunk of gunzip) {
    let bytes = chunk as Buffer;

    if (!headerParsed) {
      header = Buffer.concat([header, bytes]);
      if (header.length < 512) {
        continue;
      }
      const sizeField = header.toString("ascii", 124, 136).replace(/[^0-7]/g, "");
      bytesRemaining = parseInt(sizeField, 8);
      headerParsed = true;
      bytes = header.subarray(512);
      header = Buffer.alloc(0);
    }

    if (bytes.length > bytesRemaining) {
      bytes = bytes.subarray(0, bytesRemaining);
    }
    bytesRemaining -= bytes.length;
    const done = bytesRemaining <= 0;
    flushLines(decoder.write(bytes), done);
    if (done) {
      break;
    }
  }
}

// --- statistics --------------------------------------------------------------

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) {
    return Number.NaN;
  }
  const rank = p * (sortedAsc.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) {
    return sortedAsc[low];
  }
  return sortedAsc[low] + (sortedAsc[high] - sortedAsc[low]) * (rank - low);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function band(values: number[]): { p25: number; median: number; p75: number } | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p25: round2(percentile(sorted, 0.25)),
    median: round2(percentile(sorted, 0.5)),
    p75: round2(percentile(sorted, 0.75)),
  };
}

// --- end-use categorization --------------------------------------------------

function endUseCategory(token: string): string | null {
  if (token.startsWith("heating")) return "heating";
  if (token.startsWith("cooling")) return "cooling";
  if (token.startsWith("hot_water")) return "hot water";
  if (token.startsWith("lighting")) return "lighting";
  if (token === "pv") return "solar PV";
  if (token === "ev_charging") return "EV charging";
  if (token === "mech_vent") return "ventilation";
  if (["clothes_dryer", "clothes_washer", "dishwasher", "range_oven", "refrigerator", "freezer", "cooking"].includes(token)) {
    return "appliances";
  }
  return null;
}

const END_USE_SAVINGS_RE =
  /^out\.(?:electricity|natural_gas|fuel_oil|propane)\.([a-z0-9_]+)\.energy_savings\.\.kwh$/;

interface UpgradeCurve {
  upgrade_id: number;
  upgrade_name: string;
  source: string;
  climate_zone: string;
  buildings_applicable: number;
  annual_energy_savings_kwh: { p25: number; median: number; p75: number } | null;
  annual_utility_cost_savings_usd: { p25: number; median: number; p75: number } | null;
  affected_end_uses: string[];
  applicable_building_types: string[];
  notes: string;
}

async function parseUpgrade(
  upgradeId: number,
  upgradeName: string,
  filePath: string,
): Promise<UpgradeCurve> {
  let header: string[] | null = null;
  let idxBldgStatus = -1;
  let idxApplicability = -1;
  let idxClimate = -1;
  let idxBuildingType = -1;
  let idxEnergySavings = -1;
  let idxBillSavings = -1;
  let maxIdx = 0;
  // category -> column indices contributing to it
  const endUseCols = new Map<string, number[]>();

  const energySavings: number[] = [];
  const billSavings: number[] = [];
  const buildingTypes = new Set<string>();
  const categorySums = new Map<string, number>();

  await forEachCsvLine(filePath, line => {
    if (header === null) {
      header = parseCsvLine(line);
      idxBldgStatus = header.indexOf("completed_status");
      idxApplicability = header.indexOf("applicability");
      idxClimate = header.indexOf(CLIMATE_ZONE_COL);
      idxBuildingType = header.indexOf(BUILDING_TYPE_COL);
      idxEnergySavings = header.indexOf(ENERGY_SAVINGS_COL);
      idxBillSavings = header.indexOf(BILL_SAVINGS_COL);

      header.forEach((name, index) => {
        const match = END_USE_SAVINGS_RE.exec(name);
        if (!match) {
          return;
        }
        const category = endUseCategory(match[1]);
        if (category === null) {
          return;
        }
        const cols = endUseCols.get(category) ?? [];
        cols.push(index);
        endUseCols.set(category, cols);
      });

      maxIdx = Math.max(
        idxBldgStatus, idxApplicability, idxClimate, idxBuildingType,
        idxEnergySavings, idxBillSavings,
        ...[...endUseCols.values()].flat(),
      );
      return;
    }

    const row = parseCsvLine(line, maxIdx + 1);
    if (row[idxBldgStatus] !== "Success") return;
    if (row[idxApplicability] !== "true") return;
    if (row[idxClimate] !== CLIMATE_ZONE) return;

    const energy = Number(row[idxEnergySavings]);
    if (!Number.isFinite(energy)) {
      return;
    }
    energySavings.push(energy);

    const bill = Number(row[idxBillSavings]);
    if (Number.isFinite(bill)) {
      billSavings.push(bill);
    }

    const buildingType = row[idxBuildingType];
    if (buildingType) {
      buildingTypes.add(buildingType);
    }

    for (const [category, cols] of endUseCols) {
      let sum = 0;
      for (const col of cols) {
        const value = Number(row[col]);
        if (Number.isFinite(value)) {
          sum += value;
        }
      }
      categorySums.set(category, (categorySums.get(category) ?? 0) + sum);
    }
  });

  const totalAbs = [...categorySums.values()].reduce((sum, value) => sum + Math.abs(value), 0);
  const affectedEndUses =
    totalAbs === 0
      ? []
      : [...categorySums.entries()]
          .filter(([, value]) => Math.abs(value) / totalAbs >= END_USE_SHARE_THRESHOLD)
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .map(([category]) => category);

  return {
    upgrade_id: upgradeId,
    upgrade_name: upgradeName,
    source: "NREL ResStock End-Use Savings Shapes, New York, ASHRAE climate zone 4A",
    climate_zone: CLIMATE_ZONE,
    buildings_applicable: energySavings.length,
    annual_energy_savings_kwh: band(energySavings),
    annual_utility_cost_savings_usd: band(billSavings),
    affected_end_uses: affectedEndUses,
    applicable_building_types: [...buildingTypes].sort(),
    notes:
      "Per-building savings vs the ResStock Baseline scenario (positive = reduction). " +
      "Energy is total site energy (kWh). Only completed, applicable dwellings in climate zone 4A are counted. " +
      "Affected end uses are those whose net savings is at least 5% of the upgrade's total end-use savings.",
  };
}

interface ParseReport {
  filesFound: string[];
  baselineFile: string;
  baselineConfirmedBy: string;
  upgradesProcessed: number;
  buildingIdColumn: string;
  climateZoneColumn: string;
  energyColumn: string;
  utilityCostColumn: string;
  crosswalkUsed: boolean;
  skipped: string[];
  notes: string[];
}

function renderReport(report: ParseReport, curves: UpgradeCurve[]): string {
  const list = (items: string[]) => (items.length > 0 ? items.map(i => `- ${i}`).join("\n") : "- (none)");
  const withCost = curves.filter(c => c.annual_utility_cost_savings_usd !== null).length;
  const totalBuildings = curves.reduce((sum, c) => sum + c.buildings_applicable, 0);

  return `# ResStock NY parse report

_Generated by \`npm run parse:resstock\`._

## Files

- Files found: **${report.filesFound.length}** (${report.filesFound.length - 1} upgrade files + baseline)
- Baseline file detected: \`${report.baselineFile}\` (confirmed by ${report.baselineConfirmedBy})
- Upgrade files processed: **${report.upgradesProcessed}**

## Columns used

- Building ID column: \`${report.buildingIdColumn}\`
- Climate-zone column: \`${report.climateZoneColumn}\` (filtered to ${CLIMATE_ZONE})
- Energy savings column: \`${report.energyColumn}\`
- Utility cost column: \`${report.utilityCostColumn}\`
- measure_name_crosswalk_res_2025_1.xlsx used: **${report.crosswalkUsed ? "yes" : "no"}**

## Results

- Upgrade curves written: **${curves.length}**
- Curves with utility-cost savings: **${withCost}**
- Total applicable 4A dwellings counted across upgrades: **${totalBuildings.toLocaleString("en-US")}**

## Skipped files or missing fields

${list(report.skipped)}

## Notes and assumptions

${list(report.notes)}
`;
}

async function main(): Promise<void> {
  const lookup: Record<string, string> = JSON.parse(
    readFileSync(join(resstockDir, "upgrades_lookup.json"), "utf8"),
  );
  if (lookup["0"] !== "Baseline") {
    throw new Error(`upgrades_lookup.json does not confirm upgrade 0 is the baseline (got "${lookup["0"]}")`);
  }

  const filesFound: string[] = [];
  const skipped: string[] = [];
  const curves: UpgradeCurve[] = [];

  // RESSTOCK_ONLY=N limits the run to one upgrade, for a fast sanity check.
  const only = process.env.RESSTOCK_ONLY ? Number(process.env.RESSTOCK_ONLY) : null;

  for (let id = 0; id <= 32; id++) {
    if (only !== null && id !== 0 && id !== only) {
      continue;
    }
    const file = `NY_upgrade${id}.csv.gz`;
    const path = join(resstockDir, file);
    if (!existsSync(path)) {
      skipped.push(`${file}: not found`);
      continue;
    }
    filesFound.push(file);
    if (id === 0) {
      continue; // baseline: the per-building savings columns are measured against it
    }
    const name = lookup[String(id)] ?? `Upgrade ${id}`;
    process.stdout.write(`  upgrade ${id} (${name.slice(0, 48)}…) `);
    const curve = await parseUpgrade(id, name, path);
    process.stdout.write(`-> ${curve.buildings_applicable} dwellings\n`);
    curves.push(curve);
  }

  const report: ParseReport = {
    filesFound,
    baselineFile: "NY_upgrade0.csv.gz",
    baselineConfirmedBy: 'upgrades_lookup.json ("0": "Baseline")',
    upgradesProcessed: curves.length,
    buildingIdColumn: "bldg_id",
    climateZoneColumn: CLIMATE_ZONE_COL,
    energyColumn: ENERGY_SAVINGS_COL,
    utilityCostColumn: BILL_SAVINGS_COL,
    crosswalkUsed: false,
    skipped,
    notes: [
      "The NY_upgrade*.csv.gz files are gzipped TAR archives (single .csv member); read via streaming gunzip + in-archive tar extraction, never unzipped to disk.",
      "ResStock provides a per-building savings column per upgrade (measured vs Baseline), so the baseline join is already done in the data; that column is read directly.",
      "A quote-aware CSV parser is required: several fields are quoted and contain commas, so a naive comma split misaligns columns.",
      "measure_name_crosswalk_res_2025_1.xlsx was not needed: upgrades_lookup.json already gives clean upgrade names.",
      "Building types come from in.geometry_building_type_recs; affected end uses from the per-fuel end-use savings columns.",
    ],
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(curves, null, 2)}\n`);
  writeFileSync(reportPath, renderReport(report, curves));

  console.log(`\nWrote ${curves.length} upgrade curves to ${outPath}`);
  console.log(`Wrote parse report to ${reportPath}`);
}

main().catch((error: Error) => {
  console.error(`parse-resstock failed: ${error.message}`);
  process.exitCode = 1;
});

// REMDB normalizer: turns the NREL Residential Efficiency Measures Database
// "Machine Read" sheet into shared NormalizedMeasure records.
//
// REMDB has no JSON API — it ships as an .xlsx (data.openei.org/submissions/8336),
// so no OpenEI key is needed; the file is a public download. The "Machine Read"
// sheet is a price-regression model, not a cost table: installed cost is
//   (coef1 x metric1 + coef2 x metric2 + intercept) x install_multiplier + install_adder
// with separate Low / Mid / High coefficient and intercept columns. We evaluate
// that model at the midpoint of each performance metric's stated valid range to
// get one representative installed retrofit cost per measure, and record the
// exact evaluation point and source row in notes. Costs are REMDB's own model
// applied at a documented sizing — nothing is invented, and savings stay null
// because this sheet carries none (ResStock supplies savings downstream).

import {
  emptyMeasure,
  MEASURE_FIELDS,
  type NormalizedMeasure,
} from "./normalized/measureSchema.ts";

export const REMDB_XLSX_URL =
  "https://data.openei.org/files/8336/REMDB_2024.12.23.xlsx";
export const REMDB_XLSX_FILENAME = "REMDB_2024.12.23.xlsx";
export const REMDB_SHEET = "Machine Read";

// Column layout of the "Machine Read" sheet (header is row index 1; data starts
// at row index 2). Indices are fixed by the published file's structure.
const COL = {
  name: 0,
  className: 1,
  outputUnits: 3,
  m1CoefLow: 4,
  m1CoefMid: 5,
  m1CoefHigh: 6,
  m1Metric: 7,
  m1Unit: 8,
  m1Lower: 9,
  m1Upper: 10,
  m2CoefLow: 11,
  m2CoefMid: 12,
  m2CoefHigh: 13,
  m2Metric: 14,
  m2Unit: 15,
  m2Lower: 16,
  m2Upper: 17,
  intLow: 18,
  intMid: 19,
  intHigh: 20,
  installMultRetrofit: 22,
  installAdderRetrofit: 24,
  lifetime: 26,
  dataSources: 28,
  qualitativeRank: 29,
  rowNotes: 30,
} as const;

// REMDB uses 999 in the Lifetime column as a sentinel for "effectively the life
// of the building", not a literal 999-year service life — so it becomes null.
const LIFETIME_SENTINEL = 999;

export interface RemdbParseReport {
  sourceFile: string;
  sourceUrl: string;
  sheet: string;
  rawRowCount: number;
  normalizedMeasureCount: number;
  columnsSeen: string[];
  mappedFields: string[];
  missingFields: string[];
  errors: string[];
  assumptions: string[];
}

export interface RemdbParseOutput {
  measures: NormalizedMeasure[];
  report: RemdbParseReport;
}

type Cell = unknown;
type Row = Cell[];

function num(cell: Cell): number | null {
  if (typeof cell === "number" && Number.isFinite(cell)) {
    return cell;
  }
  if (typeof cell === "string" && cell.trim() !== "" && Number.isFinite(Number(cell))) {
    return Number(cell);
  }
  return null;
}

function str(cell: Cell): string | null {
  if (typeof cell === "string" && cell.trim() !== "") {
    return cell.trim();
  }
  if (typeof cell === "number") {
    return String(cell);
  }
  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Midpoint of a metric's valid range. null when the range is absent (an "N/A"
// metric), so the term drops out rather than guessing a value.
function midpoint(lower: number | null, upper: number | null): number | null {
  if (lower === null && upper === null) {
    return null;
  }
  return ((lower ?? upper!) + (upper ?? lower!)) / 2;
}

// One installed-cost estimate (Low, Mid, or High) at the metric midpoints. Null
// when the row carries no coefficient or intercept at all for that level (so we
// never report a fabricated zero), or when the model evaluates below zero.
function installedCost(
  coef1: number | null,
  coef2: number | null,
  intercept: number | null,
  m1: number | null,
  m2: number | null,
  installMult: number,
  installAdder: number,
): number | null {
  if (coef1 === null && coef2 === null && intercept === null) {
    return null;
  }
  const retail = (coef1 ?? 0) * (m1 ?? 0) + (coef2 ?? 0) * (m2 ?? 0) + (intercept ?? 0);
  const installed = retail * installMult + installAdder;
  return installed < 0 ? null : round2(installed);
}

function normalizeRow(row: Row, sheetRowNumber: number): NormalizedMeasure | null {
  const name = str(row[COL.name]);
  if (name === null) {
    return null;
  }
  const className = str(row[COL.className]);
  const measureName = className ? `${name} — ${className}` : name;
  const slug = slugify(className ? `${name} ${className}` : name);

  const measure = emptyMeasure(`remdb:${slug}`, measureName);

  const m1 = midpoint(num(row[COL.m1Lower]), num(row[COL.m1Upper]));
  const m2 = midpoint(num(row[COL.m2Lower]), num(row[COL.m2Upper]));
  const installMult = num(row[COL.installMultRetrofit]) ?? 1;
  const installAdder = num(row[COL.installAdderRetrofit]) ?? 0;

  measure.cost_low = installedCost(
    num(row[COL.m1CoefLow]), num(row[COL.m2CoefLow]), num(row[COL.intLow]),
    m1, m2, installMult, installAdder,
  );
  measure.cost_mid = installedCost(
    num(row[COL.m1CoefMid]), num(row[COL.m2CoefMid]), num(row[COL.intMid]),
    m1, m2, installMult, installAdder,
  );
  measure.cost_high = installedCost(
    num(row[COL.m1CoefHigh]), num(row[COL.m2CoefHigh]), num(row[COL.intHigh]),
    m1, m2, installMult, installAdder,
  );
  measure.cost_unit = str(row[COL.outputUnits]);

  const rawLifetime = num(row[COL.lifetime]);
  measure.lifetime_years =
    rawLifetime === null || rawLifetime === LIFETIME_SENTINEL ? null : round2(rawLifetime);

  // Source-level facts about REMDB (the national *residential* database). We
  // assert residential, but leave commercial unknown rather than claim it.
  measure.category = name;
  measure.applies_to_residential = true;
  measure.applies_to_commercial = null;
  measure.source_name =
    "NREL Residential Efficiency Measures Database (REMDB), machine-readable release 2024-12-23";
  measure.source_file = REMDB_XLSX_FILENAME;
  measure.source_page = `${REMDB_SHEET} row ${sheetRowNumber}`;
  measure.confidence_level = "medium";
  measure.notes = buildNotes(row, m1, m2, installMult, installAdder, rawLifetime);

  return measure;
}

function buildNotes(
  row: Row,
  m1: number | null,
  m2: number | null,
  installMult: number,
  installAdder: number,
  rawLifetime: number | null,
): string {
  const m1Metric = str(row[COL.m1Metric]);
  const m1Unit = str(row[COL.m1Unit]);
  const m2Metric = str(row[COL.m2Metric]);
  const m2Unit = str(row[COL.m2Unit]);

  const evalPoints: string[] = [];
  if (m1 !== null && m1Metric && m1Metric !== "N/A") {
    evalPoints.push(`${m1Metric} = ${round2(m1)} ${m1Unit ?? ""}`.trim());
  }
  if (m2 !== null && m2Metric && m2Metric !== "N/A") {
    evalPoints.push(`${m2Metric} = ${round2(m2)} ${m2Unit ?? ""}`.trim());
  }

  const parts = [
    "Installed retrofit cost from REMDB's price regression, evaluated at the midpoint of each metric's valid range" +
      (evalPoints.length > 0 ? ` (${evalPoints.join("; ")})` : "") +
      `, with retrofit install multiplier ${installMult} and adder ${installAdder}.`,
  ];

  const dataSources = str(row[COL.dataSources]);
  if (dataSources) {
    parts.push(`REMDB data sources: ${dataSources}.`);
  }
  const rank = str(row[COL.qualitativeRank]);
  if (rank) {
    parts.push(`Qualitative rank: ${rank}.`);
  }
  if (rawLifetime === LIFETIME_SENTINEL) {
    parts.push("Lifetime 999 in source is a 'life of building' sentinel, recorded as null.");
  }
  const rowNotes = str(row[COL.rowNotes]);
  if (rowNotes) {
    parts.push(`REMDB note: ${rowNotes}`);
  }
  return parts.join(" ");
}

function summarizeFieldCoverage(measures: NormalizedMeasure[]): {
  mapped: string[];
  missing: string[];
} {
  const mapped = new Set<string>();
  for (const measure of measures) {
    for (const field of MEASURE_FIELDS) {
      if (measure[field] !== null) {
        mapped.add(field);
      }
    }
  }
  const missing = MEASURE_FIELDS.filter(field => !mapped.has(field));
  return { mapped: [...mapped], missing };
}

// Normalize the full "Machine Read" sheet, given its rows as a 2D array (row 0 is
// the group banner, row 1 the column headers, data from row 2). Pure: the caller
// reads the workbook and writes the outputs, so this stays testable offline.
export function normalizeRemdbSheet(rows: Row[]): RemdbParseOutput {
  const header = (rows[1] ?? []).map(cell => str(cell) ?? "");
  const dataRows = rows.slice(2);

  const measures: NormalizedMeasure[] = [];
  const seenIds = new Map<string, number>();

  dataRows.forEach((row, index) => {
    const measure = normalizeRow(row, index + 3); // +3: 1-based, past the two header rows
    if (measure === null) {
      return;
    }
    // Disambiguate the rare duplicate Name + Class so every id stays unique.
    const count = seenIds.get(measure.measure_id) ?? 0;
    seenIds.set(measure.measure_id, count + 1);
    if (count > 0) {
      measure.measure_id = `${measure.measure_id}_${count + 1}`;
    }
    measures.push(measure);
  });

  const { mapped, missing } = summarizeFieldCoverage(measures);

  return {
    measures,
    report: {
      sourceFile: REMDB_XLSX_FILENAME,
      sourceUrl: REMDB_XLSX_URL,
      sheet: REMDB_SHEET,
      rawRowCount: dataRows.length,
      normalizedMeasureCount: measures.length,
      columnsSeen: header.filter(name => name !== ""),
      mappedFields: mapped,
      missingFields: missing,
      errors: [],
      assumptions: [
        "REMDB has no JSON API; this reads the public REMDB 2024 .xlsx (data.openei.org/submissions/8336). No OpenEI key is needed.",
        "Cost is REMDB's own price regression evaluated at the midpoint of each performance metric's valid range, using the retrofit install multiplier and adder; the exact point is recorded per measure in notes.",
        "Low/Mid/High costs come from REMDB's Low/Mid/High coefficient and intercept columns at that same midpoint sizing.",
        "REMDB is the national residential database, so applies_to_residential is true and applies_to_commercial is left null (unknown), not false.",
        "This sheet carries cost only; all savings fields stay null (ResStock supplies residential savings in a later phase).",
      ],
    },
  };
}

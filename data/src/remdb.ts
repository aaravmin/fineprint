// REMDB fetcher: pulls residential efficiency measures from the OpenEI measures
// service and normalizes them into the shared NormalizedMeasure schema.
//
// Two hard rules from the roadmap shape this module. The API key comes from the
// environment (OPENEI_API_KEY), never hardcoded. And the normalizer maps only
// the fields a response actually carries, leaving everything else null — it
// never fabricates a cost, saving, or lifetime. Every raw key the response
// exposes is recorded in the report, so the field mapping below can be confirmed
// against the live schema rather than trusted blind.

import { fetchJson } from "./http.ts";
import {
  emptyMeasure,
  MEASURE_FIELDS,
  type NormalizedMeasure,
} from "./normalized/measureSchema.ts";

export const OPENEI_MEASURES_ENDPOINT =
  "https://api.openei.org/services/v1/measures.json";

export interface RemdbFetchReport {
  keyFound: boolean;
  endpoint: string;
  rawMeasureCount: number;
  normalizedMeasureCount: number;
  rawKeysSeen: string[];
  mappedFields: string[];
  missingFields: string[];
  errors: string[];
  assumptions: string[];
}

export interface RemdbFetchOutput {
  measures: NormalizedMeasure[];
  report: RemdbFetchReport;
}

type RawMeasure = Record<string, unknown>;
type JsonFetcher = <T>(url: string, options: { service: string }) => Promise<T>;

// Candidate source keys per schema field, tried in order. REMDB's exact column
// names are not publicly documented, so these are confirmed against the live
// response (the report lists every raw key seen). A field with no matching key
// stays null — a guessed name simply never matches, so nothing is invented.
const NUMBER_SOURCES: Partial<Record<keyof NormalizedMeasure, string[]>> = {
  cost_low: ["cost_low", "low_cost", "min_cost", "cost_min"],
  cost_mid: ["cost", "cost_mid", "mid_cost", "median_cost", "cost_median"],
  cost_high: ["cost_high", "high_cost", "max_cost", "cost_max"],
  energy_savings: ["energy_savings", "savings", "annual_savings", "savings_pct"],
  carbon_savings: ["carbon_savings", "co2_savings", "emissions_savings"],
  lifetime_years: ["lifetime", "lifetime_years", "useful_life", "life", "lifespan"],
};

const STRING_SOURCES: Partial<Record<keyof NormalizedMeasure, string[]>> = {
  measure_name: ["name", "measure", "measure_name", "title"],
  category: ["group", "category", "group_name", "type", "measure_group"],
  cost_unit: ["cost_units", "cost_unit", "units", "unit"],
  notes: ["description", "notes", "comment", "definition"],
};

function pickNumber(raw: RawMeasure, keys: string[]): number | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function pickString(raw: RawMeasure, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// One raw REMDB record to one NormalizedMeasure. Identity and source provenance
// are always set; data fields are set only where a source key matched. The
// residential/commercial flags and confidence are source-level facts about
// REMDB (the national *residential* measures database), not per-measure guesses.
function normalizeRemdbMeasure(raw: RawMeasure, index: number): NormalizedMeasure {
  const name = pickString(raw, STRING_SOURCES.measure_name ?? []) ?? `REMDB measure ${index + 1}`;
  const rawId = pickString(raw, ["id", "measure_id", "uuid"]);
  const measure = emptyMeasure(rawId ?? `remdb:${slugify(name)}`, name);

  measure.category = pickString(raw, STRING_SOURCES.category ?? []);
  measure.cost_unit = pickString(raw, STRING_SOURCES.cost_unit ?? []);
  measure.notes = pickString(raw, STRING_SOURCES.notes ?? []);

  measure.cost_low = pickNumber(raw, NUMBER_SOURCES.cost_low ?? []);
  measure.cost_mid = pickNumber(raw, NUMBER_SOURCES.cost_mid ?? []);
  measure.cost_high = pickNumber(raw, NUMBER_SOURCES.cost_high ?? []);
  measure.energy_savings = pickNumber(raw, NUMBER_SOURCES.energy_savings ?? []);
  measure.carbon_savings = pickNumber(raw, NUMBER_SOURCES.carbon_savings ?? []);
  measure.lifetime_years = pickNumber(raw, NUMBER_SOURCES.lifetime_years ?? []);

  // Source-level facts about REMDB, not invented per-measure values.
  measure.building_type = "residential";
  measure.applies_to_residential = true;
  measure.applies_to_commercial = false;
  measure.source_name = "REMDB (OpenEI National Residential Efficiency Measures Database)";
  measure.source_file = OPENEI_MEASURES_ENDPOINT;
  measure.confidence_level = "medium";

  return measure;
}

// Pull the measure array out of whatever envelope OpenEI returns: a bare array,
// or an object keyed by measures / items / result / data.
function extractRawMeasures(payload: unknown): RawMeasure[] {
  if (Array.isArray(payload)) {
    return payload as RawMeasure[];
  }
  if (payload && typeof payload === "object") {
    for (const key of ["measures", "items", "result", "results", "data"]) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        return value as RawMeasure[];
      }
    }
  }
  return [];
}

// The schema fields the normalizer can actually fill from a source (identity and
// provenance are always set; the rest depend on the data). Splits the schema
// into "mapped at least once" vs "always null across every measure".
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

export async function fetchRemdbMeasures(
  apiKey: string | undefined,
  fetcher: JsonFetcher = fetchJson,
): Promise<RemdbFetchOutput> {
  const errors: string[] = [];
  const assumptions: string[] = [
    "REMDB is the national *residential* measures database, so every measure is tagged residential with medium confidence.",
    "OpenEI does not publicly document the measures response schema; field mapping is best-effort and confirmed against the raw keys recorded below.",
  ];

  if (!apiKey || apiKey.trim() === "") {
    return {
      measures: [],
      report: {
        keyFound: false,
        endpoint: OPENEI_MEASURES_ENDPOINT,
        rawMeasureCount: 0,
        normalizedMeasureCount: 0,
        rawKeysSeen: [],
        mappedFields: [],
        missingFields: [...MEASURE_FIELDS],
        errors: ["OPENEI_API_KEY not found in the environment; no request was made."],
        assumptions,
      },
    };
  }

  const url = `${OPENEI_MEASURES_ENDPOINT}?version=latest&format=json&api_key=${encodeURIComponent(apiKey)}`;

  let payload: unknown;
  try {
    payload = await fetcher<unknown>(url, { service: "REMDB" });
  } catch (error) {
    return {
      measures: [],
      report: {
        keyFound: true,
        endpoint: OPENEI_MEASURES_ENDPOINT,
        rawMeasureCount: 0,
        normalizedMeasureCount: 0,
        rawKeysSeen: [],
        mappedFields: [],
        missingFields: [...MEASURE_FIELDS],
        errors: [`REMDB request failed: ${(error as Error).message}`],
        assumptions,
      },
    };
  }

  // OpenEI returns an error object (not an HTTP error) for a bad key or request.
  if (payload && typeof payload === "object" && "error" in (payload as Record<string, unknown>)) {
    const apiError = JSON.stringify((payload as Record<string, unknown>).error);
    return {
      measures: [],
      report: {
        keyFound: true,
        endpoint: OPENEI_MEASURES_ENDPOINT,
        rawMeasureCount: 0,
        normalizedMeasureCount: 0,
        rawKeysSeen: [],
        mappedFields: [],
        missingFields: [...MEASURE_FIELDS],
        errors: [`OpenEI returned an error: ${apiError}`],
        assumptions,
      },
    };
  }

  const rawMeasures = extractRawMeasures(payload);
  const rawKeysSeen = [
    ...new Set(rawMeasures.flatMap(measure => Object.keys(measure))),
  ].sort();

  if (rawMeasures.length === 0) {
    errors.push(
      "Response carried no recognizable measure array (checked the top level and measures/items/result/results/data).",
    );
  }

  const measures = rawMeasures.map((raw, index) => normalizeRemdbMeasure(raw, index));
  const { mapped, missing } = summarizeFieldCoverage(measures);

  return {
    measures,
    report: {
      keyFound: true,
      endpoint: OPENEI_MEASURES_ENDPOINT,
      rawMeasureCount: rawMeasures.length,
      normalizedMeasureCount: measures.length,
      rawKeysSeen,
      mappedFields: mapped,
      missingFields: missing,
      errors,
      assumptions,
    },
  };
}

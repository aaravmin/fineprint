// The shared normalized retrofit-measure schema. Every measure pulled from a
// source — REMDB/OpenEI, the NYC cost PDFs, ResStock — is normalized into this
// one shape before it is merged, so downstream code reads a single vocabulary
// no matter where a measure came from.
//
// Two rules the schema is built to enforce: a missing value is `null`, never a
// guess; and provenance (source_name / source_file / source_page) plus a
// confidence level ride with every measure, so any figure can be traced back to
// where it came from. The `emptyMeasure` factory defaults every optional field
// to null, which makes "missing means null" the path of least resistance rather
// than something each normalizer has to remember.

export type ConfidenceLevel = "high" | "medium" | "low";

export const CONFIDENCE_LEVELS: ConfidenceLevel[] = ["high", "medium", "low"];

export interface NormalizedMeasure {
  // Identity — always present, so a measure can be keyed and merged.
  measure_id: string;
  measure_name: string;

  // Classification. null when the source does not say.
  category: string | null;
  building_type: string | null;
  applies_to_residential: boolean | null;
  applies_to_commercial: boolean | null;

  // Installed cost range, expressed in cost_unit (for example "usd_per_sqft",
  // "usd_total", or "usd_per_unit"). null where the source carries no cost.
  cost_low: number | null;
  cost_mid: number | null;
  cost_high: number | null;
  cost_unit: string | null;

  // Headline savings exactly as the source states them. energy_savings and
  // carbon_savings hold whatever single figure the source gives (its unit is
  // recorded in notes); the annual_* triples below carry ranged estimates.
  energy_savings: number | null;
  carbon_savings: number | null;

  annual_energy_savings_low: number | null;
  annual_energy_savings_mid: number | null;
  annual_energy_savings_high: number | null;

  annual_utility_savings_low: number | null;
  annual_utility_savings_mid: number | null;
  annual_utility_savings_high: number | null;

  lifetime_years: number | null;

  // Provenance. source_page is a number or a printed range like "12-13"; null
  // when the source is not a paginated document.
  source_name: string | null;
  source_file: string | null;
  source_page: number | string | null;
  confidence_level: ConfidenceLevel | null;
  notes: string | null;
}

// The canonical field order. Validators, normalizers, and any tabular export
// walk the schema in exactly this order.
export const MEASURE_FIELDS = [
  "measure_id",
  "measure_name",
  "category",
  "building_type",
  "applies_to_residential",
  "applies_to_commercial",
  "cost_low",
  "cost_mid",
  "cost_high",
  "cost_unit",
  "energy_savings",
  "carbon_savings",
  "annual_energy_savings_low",
  "annual_energy_savings_mid",
  "annual_energy_savings_high",
  "annual_utility_savings_low",
  "annual_utility_savings_mid",
  "annual_utility_savings_high",
  "lifetime_years",
  "source_name",
  "source_file",
  "source_page",
  "confidence_level",
  "notes",
] as const;

export type MeasureField = (typeof MEASURE_FIELDS)[number];

// A blank measure: identity set, every other field null. Normalizers start
// here and fill only what their source actually provides.
export function emptyMeasure(
  measure_id: string,
  measure_name: string,
): NormalizedMeasure {
  return {
    measure_id,
    measure_name,
    category: null,
    building_type: null,
    applies_to_residential: null,
    applies_to_commercial: null,
    cost_low: null,
    cost_mid: null,
    cost_high: null,
    cost_unit: null,
    energy_savings: null,
    carbon_savings: null,
    annual_energy_savings_low: null,
    annual_energy_savings_mid: null,
    annual_energy_savings_high: null,
    annual_utility_savings_low: null,
    annual_utility_savings_mid: null,
    annual_utility_savings_high: null,
    lifetime_years: null,
    source_name: null,
    source_file: null,
    source_page: null,
    confidence_level: null,
    notes: null,
  };
}

// Structural validation: confirms an object carries exactly the schema's fields
// (present, even if null) and nothing extra, that the identity fields are
// non-empty strings, and that confidence_level is an allowed value or null.
// Returns a list of problems; an empty list means the measure is well-formed.
// It deliberately judges shape, not whether a value is "correct".
export function validateMeasure(value: unknown): string[] {
  const problems: string[] = [];

  if (typeof value !== "object" || value === null) {
    return ["measure is not an object"];
  }
  const measure = value as Record<string, unknown>;

  for (const field of MEASURE_FIELDS) {
    if (!(field in measure)) {
      problems.push(`missing field: ${field}`);
    }
  }
  for (const key of Object.keys(measure)) {
    if (!(MEASURE_FIELDS as readonly string[]).includes(key)) {
      problems.push(`unexpected field: ${key}`);
    }
  }

  if (typeof measure.measure_id !== "string" || measure.measure_id.trim() === "") {
    problems.push("measure_id must be a non-empty string");
  }
  if (typeof measure.measure_name !== "string" || measure.measure_name.trim() === "") {
    problems.push("measure_name must be a non-empty string");
  }

  const confidence = measure.confidence_level;
  const confidenceAllowed =
    confidence === null || CONFIDENCE_LEVELS.includes(confidence as ConfidenceLevel);
  if (!confidenceAllowed) {
    problems.push(
      `confidence_level must be one of ${CONFIDENCE_LEVELS.join(", ")} or null`,
    );
  }

  return problems;
}

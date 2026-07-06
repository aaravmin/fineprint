// The shared header every Fineprint compliance export carries, so an external
// system (an architecture / engineering / sustainability / compliance firm) can
// recognize the format, pin a version, and key records to stable identifiers.
// The JSON Schema for the whole export lives at docs/compliance-export-schema.json.

export const EXPORT_SCHEMA_VERSION = "fineprint.compliance-export/v1";
export const EXPORT_SCHEMA_URL = "https://fineprint.app/schema/compliance-export/v1.json";

export interface BuildingIdentifiers {
  // NYC Borough-Block-Lot and Building Identification Number — the two stable
  // keys a firm uses to cross-reference DOB / PLUTO / BEAM records. null when
  // the building was added manually without a resolved identifier.
  bbl: string | null;
  bin: string | null;
}

export interface SourceCitation {
  dataset: string;
  identifier: string | null; // e.g. the BBL/BIN the record was keyed on
  as_of: string; // ISO date or a named cycle when an exact date isn't available
  fields: string[]; // which export fields this source backs
}

export interface ExportEnvelope {
  $schema: string;
  schema_version: string;
  jurisdiction: string;
  generated_at: string;
  building_identifiers: BuildingIdentifiers;
}

export function exportEnvelope(ids: BuildingIdentifiers, generatedAt?: string): ExportEnvelope {
  return {
    $schema: EXPORT_SCHEMA_URL,
    schema_version: EXPORT_SCHEMA_VERSION,
    jurisdiction: "NYC",
    generated_at: generatedAt ?? new Date().toISOString(),
    building_identifiers: {
      bbl: ids.bbl && ids.bbl.trim() !== "" ? ids.bbl : null,
      bin: ids.bin && ids.bin.trim() !== "" ? ids.bin : null,
    },
  };
}

// The standing dataset citations behind a Fineprint export. The caller passes
// the building identifiers and, where known, the energy benchmarking year so
// the emissions provenance carries a real as-of.
export function standardCitations(ids: BuildingIdentifiers, ll84Year: number | null): SourceCitation[] {
  return [
    {
      dataset: "NYC PLUTO (tax-lot characteristics)",
      identifier: ids.bbl,
      as_of: "latest available release",
      fields: ["building_summary.sqft", "applicability (stories, units, community district)"],
    },
    {
      dataset: "NYC LL84 Energy & Water Benchmarking disclosure",
      identifier: ids.bbl,
      as_of: ll84Year ? `reporting year ${ll84Year}` : "latest filing on record",
      fields: ["annual emissions", "ENERGY STAR score (LL33 grade)"],
    },
    {
      dataset: "NYC Local Law 97 emissions limits (Admin Code 28-320)",
      identifier: null,
      as_of: "2024-2029 / 2030-2034 / 2035-2039 compliance periods",
      fields: ["LL97 cap", "estimated_exposure"],
    },
    {
      dataset: "Fineprint law registry",
      identifier: EXPORT_SCHEMA_VERSION,
      as_of: "compiled with this export",
      fields: ["law applicability", "statutory deadlines", "penalty rates"],
    },
  ];
}

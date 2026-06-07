// Public types for the Fineprint data layer. This is the locked interface —
// the dashboard, the ingest script, and the agents all build against it.
//
// Every fact carries provenance: which dataset said it, so the UI can render
// an honest footnote and an agent can cite its sources. Fields the city has
// no answer for are null, never guessed.

// 10-digit borough-block-lot, the join key across every NYC dataset.
export type Bbl = string;

// BIN is the building identifier (one tax lot can hold several BINs). Optional
// because GeoSearch returns no BIN for a vacant or non-building lot.
export type Bin = string;

export interface BblResult {
  bbl: Bbl;
  bin: Bin | null;
  normalizedAddress: string;
  borough: string;
  // Pelias match quality: confidence 0..1 and match_type
  // ("exact" | "interpolated" | "fallback"). Null when the API omits them.
  confidence: number | null;
  matchType: string | null;
}

// One use within a building, in the engine's vocabulary: ESPM property type
// names (e.g. "Multifamily Housing"), ready to feed computeFine directly.
export interface UseSplit {
  group: string;
  sqft: number;
}

export interface Ll84Facts {
  bbl: Bbl;
  reportedAddress: string | null;
  grossFloorAreaSqft: number | null;
  occupancyGroups: UseSplit[];
  // As filed: ESPM's location-based GHG, which prices electricity with
  // national eGRID factors rather than the statute's coefficients.
  annualEmissionsTco2e: number | null;
  // Recomputed from the filing's fuel columns with the coefficients of
  // Admin Code 28-320.3.1.1 — the figure DOB's penalty math would use.
  // Null when any consumed fuel lacks a verified coefficient.
  recomputedEmissionsTco2e: number | null;
  // Fuel columns that blocked the recompute (no verified coefficient).
  unpriceableFuels: string[];
  reportingYear: number | null;
  // Uses whose LL84 name is missing from the rule's factor table and was
  // mapped to the nearest listed bucket — an estimate worth disclosing.
  proxiedUses: Array<{ from: string; to: string }>;
  // Uses with no defensible factor at all ("Other", utility plants). They
  // are excluded from occupancyGroups so the engine never prices them.
  unmappedUses: UseSplit[];
  // Fuels with non-zero consumption, ordered by energy (largest first).
  fuelMix: string[];
  // The largest combustion or district heating fuel; "electricity" when the
  // building is all-electric; null when the filing reports no fuel use.
  heatingFuel: string | null;
  siteEuiKbtuPerSqft: number | null;
  energyStarScore: number | null;
}

export interface ProvenanceNote {
  field: string; // which BuildingFacts field this explains
  source: string; // dataset or API name
  detail?: string; // anything a footnote should add ("no LL84 filing found")
}

// One DOB NOW: Safety Boiler filing (dataset 52dp-yji6). The dataset records
// inspection reports, so a single physical boiler (boilerId) appears once per
// report; callers dedupe on boilerId when they want a boiler count.
export interface BoilerRecord {
  boilerId: string;
  trackingNumber: string;
  bin: Bin | null;
  make: string | null;
  pressureType: string | null; // "Low Pressure" | "High Pressure"
  inspectionType: string | null;
  inspectionDate: string | null;
  defectsExist: boolean | null;
  reportStatus: string | null;
  raw: Record<string, unknown>;
}

// One DOB NOW: Build job filing (dataset w9ak-ipjd). The work-type flags are
// the building-specific signal: which systems were actually altered.
export interface BuildJobFiling {
  jobFilingNumber: string;
  bin: Bin | null;
  bbl: Bbl | null;
  jobType: string | null;
  filingStatus: string | null;
  filingDate: string | null;
  approvedDate: string | null;
  description: string | null;
  workTypes: {
    mechanical: boolean;
    boiler: boolean;
    plumbing: boolean;
    solar: boolean;
  };
  raw: Record<string, unknown>;
}

// Tax-lot characteristics from PLUTO (dataset 64uk-42ks), keyed by BBL.
// numFloors is what makes LL11/FISP applicability honest — the rule turns on
// building height, not square footage.
export interface PlutoCharacteristics {
  bbl: Bbl;
  numFloors: number | null;
  buildingClass: string | null;
  bldgAreaSqft: number | null;
  unitsResidential: number | null;
  unitsTotal: number | null;
  yearBuilt: number | null;
  landUse: string | null;
  ownerName: string | null;
  // Community district code (PLUTO "cd"), the key LL152 uses to schedule the
  // gas-piping certification cycle. Null when PLUTO omits it.
  communityDistrict: number | null;
  raw: Record<string, unknown>;
}

// One DOB NOW: Electrical permit (dataset dm9a-ab7w), keyed by BIN. The
// dataset has no structured sustainability column, so PV and storage are read
// from the job description text — an evidence signal, not a clean flag.
export interface ElectricalPermit {
  filingNumber: string;
  bin: Bin | null;
  jobDescription: string | null;
  filingStatus: string | null;
  filingDate: string | null;
  permitIssuedDate: string | null;
  isSolar: boolean;
  isStorage: boolean;
  raw: Record<string, unknown>;
}

// One open ECB violation from DOB (dataset 6bgk-3dad), with the penalty math
// the board attaches as a real dollar figure. Only ACTIVE violations are
// fetched — resolved ones carry no outstanding obligation.
export interface EcbViolation {
  ecbViolationNumber: string;
  dobViolationNumber: string | null;
  bin: Bin | null;
  status: string | null;
  violationType: string | null;
  severity: string | null; // "CLASS - 1" | "CLASS - 2"
  infractionCode: string | null;
  sectionLaw: string | null; // AC/BC citation plus its short description
  description: string | null;
  issueDate: string | null; // as filed, YYYYMMDD
  penaltyImposedUsd: number | null;
  amountPaidUsd: number | null;
  balanceDueUsd: number | null;
  raw: Record<string, unknown>;
}

// One FISP filing row from DOB NOW: Safety - Facades (dataset xubg-57si).
// filingType "Auto-Generated" with filingStatus "No Report Filed" is DOB's
// placeholder for an unfiled window — evidence of absence, not a report.
export interface FacadeFiling {
  tr6Number: string;
  bin: Bin | null;
  cycle: string | null;
  filingType: string | null;
  filingStatus: string | null;
  currentStatus: string | null; // SAFE | SWARMP | UNSAFE ...
  raw: Record<string, unknown>;
}

export interface InfrastructureProfile {
  hasLl84Filing: boolean;
  // Data year of the most recent LL84 filing on record (LL84's deadline is
  // annual, so the year is what decides whether the filing is current). Null
  // when no filing exists.
  ll84ReportingYear: number | null;
  hasRecomputedEmissions: boolean;
  fuelTypes: string[]; // detected fuel types (e.g. natural_gas, fuel_oil_4)
  // Raw evidence, kept for audit.
  boilerRecords: BoilerRecord[];
  buildJobFilings: BuildJobFiling[];
  electricalPermits: ElectricalPermit[];
  // Derived signals the drafting policies branch on. Each is backed by the
  // raw evidence above, so a suggestion can cite what it relied on.
  heatingFuel: string | null;
  hasPV: boolean;
  boilerCount: number;
  boilerCondition: string | null; // "defects_on_record" | "no_defects_on_record"
  recentHvacWork: boolean;
  efficiencyTier: string | null; // "high" | "medium" | "low" from ENERGY STAR
}

// The orchestrator's answer: everything Fineprint knows about one building,
// assembled from public data, engine-ready where the data allows it.
export interface BuildingFacts {
  bbl: Bbl;
  bin: Bin | null;
  address: string;
  grossFloorAreaSqft: number | null;
  occupancyGroups: UseSplit[];
  annualEmissionsTco2e: number | null;
  isLl97Covered: boolean | null;
  isArticle321: boolean | null;
  plutoCharacteristics: PlutoCharacteristics | null;
  infrastructureProfile?: InfrastructureProfile | null;
  openViolations: EcbViolation[];
  // FISP filings, present when the facades dataset answered for this BIN;
  // null when the dataset was not queried (no BIN) or unavailable.
  facadeFilings?: FacadeFiling[] | null;
  provenance: ProvenanceNote[];
}

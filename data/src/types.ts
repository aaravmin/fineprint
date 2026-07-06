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

// One fuel's slice of a building's energy, straight from the LL84 filing.
// kbtu is a common energy unit across fuels (electricity converted from kWh);
// tco2e is null for a fuel the statute has no verified coefficient for, so the
// per-fuel detail survives even when the whole-building recompute cannot.
export interface Ll84FuelUse {
  fuel: string; // profile label, e.g. "natural_gas", "district_steam", "electricity"
  column: string; // the raw Socrata fuel-use column this came from
  kbtu: number;
  tco2e: number | null;
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
  // Per-fuel energy and emissions from the filing, one entry per consumed
  // fuel. This is what lets the systems dossier attribute emissions to the
  // heating plant versus cooling versus plug load, rather than one total.
  fuelUse: Ll84FuelUse[];
  // Grid electricity purchased, in kWh (its native meter unit). Null when the
  // filing reports none. fuelUse carries the same figure converted to kBtu.
  electricityKwh: number | null;
  reportingYear: number | null;
  // Uses whose benchmarking name is missing from the rule's factor table and
  // was mapped to the nearest listed bucket - an estimate worth disclosing.
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
  detail?: string; // anything a footnote should add ("no benchmarking filing found")
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

// Tax-lot characteristics from PLUTO (dataset 64uk-42ks), keyed by BBL. These
// back the LL97 coverage and emissions-limit math (building class for the
// house-of-worship exemption, floor area and use for the cap).
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
  // Community district code (PLUTO "cd"). Null when PLUTO omits it.
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

// One DOB Permit Issuance record from the legacy BIS system (dataset
// ipu4-2q9a), keyed by bin__. Permits reach back to ~1989, so the work-type
// code (BL boiler, PL plumbing, MH mechanical, EQ equipment) plus the issuance
// date is the deepest vintage signal we have for a building's equipment.
export interface BisPermit {
  jobNumber: string; // job__
  permitSiNo: string | null; // permit_si_no, the unique permit id
  bin: Bin | null;
  jobType: string | null; // A1, A2, A3, NB, DM, ...
  workType: string | null; // BL, PL, MH, EQ, OT, FP, SP, ...
  permitType: string | null; // EW, PL, EQ, ...
  permitSubtype: string | null;
  permitStatus: string | null; // ISSUED, ...
  filingDate: string | null; // MM/DD/YYYY as filed
  issuanceDate: string | null;
  expirationDate: string | null;
  raw: Record<string, unknown>;
}

// One DOB Job Application filing from the legacy BIS system (dataset
// ic3t-wcy2), keyed by bin__. The free-text job description is the signal:
// boiler / oil-to-gas / heat pump / chiller / roof / window / solar work,
// classified downstream rather than here.
export interface BisJobFiling {
  jobNumber: string; // job__
  bin: Bin | null;
  bbl: Bbl | null;
  jobType: string | null; // A1, A2, A3, NB, DM, ...
  jobStatus: string | null; // job_status_descrp, the human-readable status
  description: string | null; // job_description free text
  preFilingDate: string | null; // MM/DD/YYYY
  approvedDate: string | null;
  latestActionDate: string | null;
  raw: Record<string, unknown>;
}

// One DOB violation (dataset 3h2n-5cm9), keyed by bin. The type code carries
// the signal: E for elevator, LBLVIO for a low-pressure boiler, C for
// construction, and the category says whether it is still active.
export interface DobViolation {
  violationNumber: string; // violation_number
  isnDobBisViol: string | null; // isn_dob_bis_viol, the internal id
  bin: Bin | null;
  violationTypeCode: string | null; // E, LBLVIO, BENCH, C, AEUHAZ1, ...
  violationType: string | null; // human-readable "C-CONSTRUCTION ..."
  violationCategory: string | null; // "V-DOB VIOLATION - ACTIVE", ...
  issueDate: string | null; // YYYYMMDD as filed
  deviceNumber: string | null; // set for elevator/boiler device violations
  description: string | null;
  raw: Record<string, unknown>;
}

// One HPD Housing Maintenance Code violation (dataset wvxf-dwi5), keyed by bin.
// Class C is immediately hazardous; the description names the failure, and a
// run of heat/hot-water violations across a heating season is the clearest
// public signal of a failing heating plant.
export interface HpdViolation {
  violationId: string; // violationid
  bin: Bin | null;
  violationClass: string | null; // A, B, C, I
  novType: string | null; // Original, Reissued, ...
  description: string | null; // novdescription, cites the Admin Code section
  novIssuedDate: string | null; // ISO
  currentStatus: string | null; // "VIOLATION OPEN", "VIOLATION CLOSED", ...
  currentStatusDate: string | null;
  inspectionDate: string | null;
  apartment: string | null;
  rentImpairing: boolean | null; // rentimpairing Y/N
  raw: Record<string, unknown>;
}

// One HPD complaint problem (dataset ygpa-z7cr), keyed by bbl. One tenant
// complaint can carry several problems; each row is one problem. The
// major/minor category (HEAT/HOT WATER, PLUMBING, ...) is the tenant-side
// signal that mirrors the violation record.
export interface HpdComplaintProblem {
  complaintId: string; // complaint_id
  problemId: string | null; // problem_id
  bbl: Bbl | null;
  bin: Bin | null;
  majorCategory: string | null; // HEAT/HOT WATER, PLUMBING, ELECTRIC, ...
  minorCategory: string | null;
  problemCode: string | null;
  complaintStatus: string | null; // OPEN, CLOSE, ...
  problemStatus: string | null;
  statusDescription: string | null;
  receivedDate: string | null; // ISO
  raw: Record<string, unknown>;
}

// One DEP Clean Air Tracking System registration (dataset f4rp-2kvy), keyed by
// bin. Besides LL84, this is the strongest heating-fuel and vintage signal: the
// registered fuel (No. 2/4/6 oil or natural gas), the boiler make/model, and
// the issue/expiration dates that bracket when a boiler was in service.
export interface CatsPermit {
  applicationId: string; // applicationid
  requestId: string | null; // requestid
  requestType: string | null; // "CERTIFICATE TO OPERATE", ...
  bin: Bin | null;
  primaryFuel: string | null; // NO6FUEL, NO4FUEL, NO2FUEL, NATURALGAS, ...
  secondaryFuel: string | null;
  make: string | null;
  model: string | null;
  burnerMake: string | null;
  burnerModel: string | null;
  issueDate: string | null; // ISO
  expirationDate: string | null;
  status: string | null; // ACTIVE, EXPIRED, CANCELLED, ...
  raw: Record<string, unknown>;
}

// One elevator device from DOB NOW: Safety (dataset e5aq-a4j2), keyed by bin.
// The device count and status feed the elevators system assessment.
export interface ElevatorDevice {
  deviceNumber: string; // device_number
  bin: Bin | null;
  deviceType: string | null; // Elevator, Escalator, ...
  deviceStatus: string | null; // Active, Dismantled, ...
  statusDate: string | null; // ISO
  lastPeriodicInspection: string | null; // periodic_latest_inspection, ISO
  cat1ReportYear: string | null; // most recent Category 1 test year
  raw: Record<string, unknown>;
}

export interface InfrastructureProfile {
  hasLl84Filing: boolean;
  // Data year of the most recent benchmarking filing on record (its deadline is
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
  // The ENERGY STAR score itself (0-100) from the latest benchmarking filing.
  // Null when the filing carries no score (a use type ENERGY STAR cannot rate).
  energyStarScore: number | null;
}

// The raw public-record history behind a building, one array per dataset. Each
// stays [] when the record could not be pulled (no BIN, or the source was
// silent), with the reason recorded in BuildingFacts.provenance. The systems
// dossier reads these; the fine math does not.
export interface PublicRecords {
  bisPermits: BisPermit[];
  bisJobs: BisJobFiling[];
  dobViolations: DobViolation[];
  hpdViolations: HpdViolation[];
  hpdComplaints: HpdComplaintProblem[];
  catsPermits: CatsPermit[];
  elevatorDevices: ElevatorDevice[];
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
  // The per-fuel energy and emissions behind annualEmissionsTco2e, straight from
  // the LL84 filing. Empty when the building has no filing. This is what lets the
  // systems dossier attribute emissions to the heating plant versus cooling
  // versus plug load rather than working from one whole-building total.
  ll84FuelUse: Ll84FuelUse[];
  isLl97Covered: boolean | null;
  isArticle321: boolean | null;
  plutoCharacteristics: PlutoCharacteristics | null;
  infrastructureProfile?: InfrastructureProfile | null;
  openViolations: EcbViolation[];
  publicRecords: PublicRecords;
  provenance: ProvenanceNote[];
}

// The eight major systems the dossier reasons about. Personalized retrofit
// measures target one of these, so the keys are the join between what a building
// has and what it could do about it.
export type SystemKey =
  | "heating_plant"
  | "domestic_hot_water"
  | "cooling"
  | "envelope"
  | "solar_pv"
  | "elevators"
  | "electrical_service"
  | "lighting";

// One public record that backs a claim in the dossier. Every non-"unknown"
// assessment carries at least one, so a suggestion can name the permit,
// violation, or registration it relied on and the owner can go read it.
export interface EvidenceRef {
  dataset: string; // human name, e.g. "DOB Permit Issuance (BIS)"
  datasetId: string; // Socrata id, e.g. "ipu4-2q9a"
  recordId: string | null; // the record's own id, or null for an absence-of-record note
  date: string | null; // ISO, the date the record carries
  note: string; // one human sentence, e.g. "Boiler work permit issued 1995-01-17"
}

// One system's inferred profile. A draft log the owner confirms, not ground
// truth: fuel, vintage, and condition are read from the public record where it
// speaks and left null/"unknown" where it does not. estAnnualTco2e and
// shareOfEmissions are a coarse attribution of the building's LL84 emissions to
// this system; both are null when the filing has no fuel breakdown to divide.
export interface SystemAssessment {
  system: SystemKey;
  presence: "confirmed" | "assumed" | "none" | "unknown";
  headline: string; // "No. 4 fuel oil boiler, installed around 1995"
  fuel: string | null;
  vintageYear: number | null;
  vintageBasis: string | null; // "latest BIS boiler permit (1995)" | "assumed original to the 1923 building"
  condition: "failing" | "aging" | "serviceable" | "recently_replaced" | "unknown";
  conditionSignals: string[]; // human sentences behind the condition
  estAnnualTco2e: number | null;
  shareOfEmissions: number | null; // 0..1 of the building's attributed total
  attributionBasis: string | null;
  confidence: "high" | "medium" | "low";
  evidence: EvidenceRef[];
}

// The whole dossier for one building: every system, the total it was attributed
// against, and a plain-language note on how the attribution was done and what it
// leaves out. generatedFrom lists the dataset ids that had something to say.
export interface BuildingSystems {
  systems: SystemAssessment[];
  totalTco2e: number | null;
  attributionNote: string;
  generatedFrom: string[];
}

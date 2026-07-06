// The systems dossier: BuildingFacts in, a per-system draft log out. Phase 1
// assembles the deep public record - permits, violations, complaints, boiler and
// elevator registrations, the LL84 fuel breakdown; this reads that record to
// infer what each of a building's major systems is, how old it is, what
// condition it is in, and how much of the building's emissions it drives. Every
// non-"unknown" claim names the record it stands on, and "unknown" is a
// legitimate, common answer - this is a draft the owner confirms, not ground
// truth, so we never guess to fill a field.
//
// The one place this reasons past a single source is heating fuel. An LL84
// filing can be wrong: 900 Grand Concourse's latest disclosure reads
// electricity-only while DEP CATS proves an active No. 4 oil boiler. So the fuel
// precedence trusts a filed fossil fuel, but treats an electricity-only filing
// for an old multifamily building as suspect when CATS shows recent fossil
// combustion, and reconciles to CATS at low confidence with both sources cited.

import { fuelRole } from "./ll84.ts";
import { parseRecordDate, recordYear } from "./dates.ts";
import { applyUserOverrides, type UserOverrides } from "./overrides.ts";
import type {
  BisJobFiling,
  BisPermit,
  BuildingFacts,
  BuildingSystems,
  CatsPermit,
  DobViolation,
  ElevatorDevice,
  EvidenceRef,
  HpdComplaintProblem,
  HpdViolation,
  Ll84FuelUse,
  SystemAssessment,
} from "./types.ts";

type Presence = SystemAssessment["presence"];
type Condition = SystemAssessment["condition"];
type Confidence = SystemAssessment["confidence"];

// Human name plus Socrata id for each dataset the dossier can cite. The names
// match the provenance sources lookupBuilding already records, so a reader sees
// one vocabulary across the whole product.
const DATASET = {
  ll84: { name: "LL84 Benchmarking Disclosure", id: "5zyy-y8am" },
  pluto: { name: "NYC PLUTO", id: "64uk-42ks" },
  bisPermits: { name: "DOB Permit Issuance (BIS)", id: "ipu4-2q9a" },
  bisJobs: { name: "DOB Job Application Filings (BIS)", id: "ic3t-wcy2" },
  dobViolations: { name: "DOB Violations", id: "3h2n-5cm9" },
  hpdViolations: { name: "HPD Housing Maintenance Code Violations", id: "wvxf-dwi5" },
  hpdComplaints: { name: "HPD Complaints and Problems", id: "ygpa-z7cr" },
  cats: { name: "DEP Clean Air Tracking System", id: "f4rp-2kvy" },
  elevators: { name: "DOB NOW Elevator Devices", id: "e5aq-a4j2" },
  electrical: { name: "DOB NOW Electrical Permits", id: "dm9a-ab7w" },
} as const;

// A boiler installed within this many years reads as recently replaced - new
// enough that its condition is presumed good and a fuel switch would be
// premature. Ten years is the low end of a commercial boiler's 20-30 year life.
const RECENT_REPLACEMENT_YEARS = 10;

// Past this age a boiler is aging: at or beyond the midpoint of its service
// life, where efficiency has faded and replacement enters the planning horizon.
const AGING_VINTAGE_YEARS = 25;

// With no install date on record, a building older than this is assumed to carry
// aging equipment. Thirty-five years outlives any boiler installed with the
// building, so the plant has turned over at least once and its true age is
// unknown - aging is the honest floor, not failing.
const NO_VINTAGE_AGING_YEARS = 35;

// Heat and hot-water failures, per residential unit, over the recent window,
// above which the heating plant reads as failing. A well-run building draws the
// occasional complaint; sustained HPD heat/hot-water violations and complaints
// touching more than a tenth of units across three winters is a plant that
// cannot hold temperature. Normalized per unit so a 300-unit tower and a 6-unit
// walk-up are judged on one scale. No agency publishes such a rate; this is a
// deliberately conservative editorial threshold.
const FAILING_HEAT_EVENTS_PER_UNIT = 0.1;

// When the residential unit count is unknown, the per-unit rate can't be formed,
// so fall back to an absolute count of inspector-confirmed heat/hot-water
// violations. Eight over three seasons is a pattern no functioning plant should
// produce.
const FAILING_HEAT_VIOLATIONS_WITHOUT_UNITS = 8;

// The recent window for heat/hot-water signals: three heating seasons. One bad
// winter can be a fluke (a failed part, since fixed); three is a pattern.
const HEAT_SIGNAL_WINDOW_YEARS = 3;

// A multifamily building built before this year predates cost-effective
// all-electric heating, so an all-electric LL84 filing for one is implausible on
// its face - the trigger to distrust the filing when CATS shows fossil fuel.
const PRE_ELECTRIFICATION_ERA_YEAR = 1990;

// How recently a CATS fossil registration must fall to count as live evidence
// that the building still burns that fuel, against an anomalous electricity-only
// LL84 filing. A boiler certificate runs a few years; fifteen spans several
// renewal cycles, so a registration this recent means the plant was combusting
// oil or gas well after the filing claims it went all-electric.
const RECENT_FOSSIL_REGISTRATION_YEARS = 15;

type UseFamily = "multifamily" | "office" | "retail" | "other";

const USE_FAMILY_LABEL: Record<UseFamily, string> = {
  multifamily: "multifamily housing",
  office: "office",
  retail: "retail",
  other: "mixed use",
};

// How a building's fossil heating fuel divides between space heating and
// domestic hot water, by use family. Residential buildings run hot water
// year-round for hundreds of apartments, so DHW takes a real bite; offices heat
// space and barely draw hot water. Coarse typical splits in the spirit of the
// engine's hardcoded ESPM factors - CBECS/RECS end-use shares, an editorial
// estimate the owner's own bills would refine.
interface HeatingSplit {
  heatingPlant: number;
  domesticHotWater: number;
}

const HEATING_USE_SPLIT: Record<UseFamily, HeatingSplit> = {
  multifamily: { heatingPlant: 0.7, domesticHotWater: 0.3 },
  office: { heatingPlant: 0.9, domesticHotWater: 0.1 },
  retail: { heatingPlant: 0.9, domesticHotWater: 0.1 },
  other: { heatingPlant: 0.8, domesticHotWater: 0.2 },
};

// How a building's electricity divides across cooling, lighting, and elevators,
// by use family. The rest - the remainder below 1 - is plug and process load,
// attributed to no system on purpose. Offices are lighting- and cooling-heavy;
// residential electricity is dominated by in-unit plug and appliance load. Same
// coarse CBECS-style basis as the heating split.
interface ElectricitySplit {
  cooling: number;
  lighting: number;
  elevators: number;
}

const ELECTRICITY_USE_SPLIT: Record<UseFamily, ElectricitySplit> = {
  multifamily: { cooling: 0.15, lighting: 0.15, elevators: 0.05 },
  office: { cooling: 0.25, lighting: 0.3, elevators: 0.05 },
  retail: { cooling: 0.2, lighting: 0.35, elevators: 0.02 },
  other: { cooling: 0.2, lighting: 0.25, elevators: 0.05 },
};

// One system's slice of the building's emissions, or all nulls when the LL84
// fuel breakdown can't support the attribution.
interface SystemEmissions {
  tco2e: number | null;
  share: number | null;
  basis: string | null;
}

interface EmissionsAttribution {
  totalTco2e: number | null;
  note: string;
  heatingPlant: SystemEmissions;
  domesticHotWater: SystemEmissions;
  cooling: SystemEmissions;
  lighting: SystemEmissions;
  elevators: SystemEmissions;
}

const NO_EMISSIONS: SystemEmissions = { tco2e: null, share: null, basis: null };

// One address's systems dossier. Deterministic given asOf, which dates every
// recency and window judgment; nothing reads the wall clock.
export function assessBuildingSystems(
  facts: BuildingFacts,
  asOf: Date,
  overrides?: UserOverrides,
): BuildingSystems {
  const heatingFuel = resolveHeatingFuel(facts, asOf);
  const attribution = attributeEmissions(facts, heatingFuel);

  const heatingPlant = assessHeatingPlant(facts, asOf, heatingFuel, attribution.heatingPlant);
  const domesticHotWater = assessDomesticHotWater(
    facts,
    asOf,
    heatingPlant,
    attribution.domesticHotWater,
  );
  const cooling = assessCooling(facts, attribution.cooling);
  const envelope = assessEnvelope(facts, asOf);
  const solarPv = assessSolarPv(facts);
  const elevators = assessElevators(facts, asOf, attribution.elevators);
  const electricalService = assessElectricalService(facts);
  const lighting = assessLighting(facts, asOf, attribution.lighting);

  const base: BuildingSystems = {
    systems: [
      heatingPlant,
      domesticHotWater,
      cooling,
      envelope,
      solarPv,
      elevators,
      electricalService,
      lighting,
    ],
    totalTco2e: attribution.totalTco2e,
    attributionNote: attribution.note,
    generatedFrom: consultedDatasets(facts),
  };

  return applyUserOverrides(base, overrides);
}

// The result of the heating-fuel precedence: the resolved fuel plus everything
// the heating-plant assessment needs to explain and cite it.
interface HeatingFuelResolution {
  fuel: string | null;
  presence: Presence;
  confidence: Confidence;
  // On-site combustion (oil, gas, propane) versus purchased heat or electricity.
  // Drives the attribution: a fossil fuel resolved from CATS that LL84 omits
  // cannot be priced from the filing.
  isFossilCombustion: boolean;
  source: "ll84" | "cats" | "bis_conversion" | "era" | "none";
  headlineFuel: string;
  evidence: EvidenceRef[];
  signals: string[];
}

// Heating fuel by precedence: a fossil or district fuel the LL84 filing reports
// (the building's own disclosure) wins; an electricity-only filing for an old
// multifamily building is distrusted when CATS shows recent fossil combustion;
// otherwise fall back to CATS, then a filed oil-to-gas conversion, then the
// building's era - degrading confidence at each step.
function resolveHeatingFuel(facts: BuildingFacts, asOf: Date): HeatingFuelResolution {
  const ll84 = ll84HeatingFuel(facts.ll84FuelUse);
  const catsFossil = recentFossilCats(facts.publicRecords.catsPermits, asOf);
  const reportingYear = facts.infrastructureProfile?.ll84ReportingYear ?? null;

  if (ll84.label !== null && ll84.label !== "electricity") {
    const human = humanFuelLabel(ll84.label);
    const evidence = [ll84HeatingEvidence(human, reportingYear)];
    const signals: string[] = [];

    if (catsFossil && catsFossil.fuel !== human) {
      evidence.push(catsFossil.evidence);
      signals.push(
        `DEP CATS registers a ${catsFossil.fuel} boiler, but the LL84 filing reports ${human}; the filed fuel is what the fine math uses.`,
      );
    }

    return {
      fuel: human,
      presence: "confirmed",
      confidence: "high",
      isFossilCombustion: isCombustionFuel(ll84.label),
      source: "ll84",
      headlineFuel: human,
      evidence,
      signals,
    };
  }

  if (ll84.isElectricOnly) {
    if (catsFossil && isOlderMultifamily(facts) && !recentElectrification(facts, asOf)) {
      return {
        fuel: catsFossil.fuel,
        presence: "confirmed",
        confidence: "low",
        isFossilCombustion: true,
        source: "cats",
        headlineFuel: catsFossil.fuel,
        evidence: [ll84ElectricOnlyEvidence(reportingYear), catsFossil.evidence],
        signals: [
          `The latest LL84 filing reports electricity only, but DEP CATS shows a ${catsFossil.fuel} boiler registered as recently as ${catsFossil.throughYear}. The filing appears to omit the building's heating fuel, so the fuel here comes from the CATS registration at low confidence.`,
        ],
      };
    }

    return {
      fuel: "electricity",
      presence: "confirmed",
      confidence: "medium",
      isFossilCombustion: false,
      source: "ll84",
      headlineFuel: "electric",
      evidence: [ll84ElectricOnlyEvidence(reportingYear)],
      signals: [],
    };
  }

  if (catsFossil) {
    return {
      fuel: catsFossil.fuel,
      presence: "confirmed",
      confidence: "medium",
      isFossilCombustion: true,
      source: "cats",
      headlineFuel: catsFossil.fuel,
      evidence: [catsFossil.evidence],
      signals: [],
    };
  }

  const conversion = oilToGasConversion(facts.publicRecords.bisJobs);
  if (conversion) {
    return {
      fuel: "natural gas",
      presence: "assumed",
      confidence: "low",
      isFossilCombustion: true,
      source: "bis_conversion",
      headlineFuel: "natural gas",
      evidence: [conversion],
      signals: ["A DOB filing describes an oil-to-gas conversion; the fuel is assumed to be gas."],
    };
  }

  const yearBuilt = facts.plutoCharacteristics?.yearBuilt ?? null;
  if (yearBuilt !== null && yearBuilt < PRE_ELECTRIFICATION_ERA_YEAR) {
    return {
      fuel: "fuel oil or gas (unconfirmed)",
      presence: "assumed",
      confidence: "low",
      isFossilCombustion: false,
      source: "era",
      headlineFuel: "fuel oil or gas",
      evidence: [plutoEraEvidence(facts)],
      signals: [
        "No fuel is on record; a building of this era is assumed to burn fuel oil or gas until the owner confirms.",
      ],
    };
  }

  return {
    fuel: null,
    presence: "unknown",
    confidence: "low",
    isFossilCombustion: false,
    source: "none",
    headlineFuel: "unknown fuel",
    evidence: [],
    signals: [],
  };
}

// Split the building's LL84 emissions across systems. Fossil heating fuel goes
// to the heating plant and hot water; electricity to cooling, lighting, and
// elevators, with the rest left as unassigned plug load. Returns all nulls when
// the filing has no fuel breakdown - a fuel mix is never invented.
function attributeEmissions(
  facts: BuildingFacts,
  heatingFuel: HeatingFuelResolution,
): EmissionsAttribution {
  const fuelUse = facts.ll84FuelUse;

  if (fuelUse.length === 0) {
    return {
      totalTco2e: null,
      note: "No LL84 fuel breakdown is on file for this building, so its emissions cannot be attributed to individual systems. A benchmarking filing would unlock per-system attribution.",
      heatingPlant: NO_EMISSIONS,
      domesticHotWater: NO_EMISSIONS,
      cooling: NO_EMISSIONS,
      lighting: NO_EMISSIONS,
      elevators: NO_EMISSIONS,
    };
  }

  const family = dominantUseFamily(facts);
  const familyName = USE_FAMILY_LABEL[family];
  const heatingSplit = HEATING_USE_SPLIT[family];
  const electricitySplit = ELECTRICITY_USE_SPLIT[family];

  const pricedTotal = sumTco2e(fuelUse);
  const heatingTco2e = sumTco2e(fuelUse.filter(fuel => fuelRole(fuel.column) === "heating"));
  const electricityTco2e = sumTco2e(
    fuelUse.filter(fuel => fuelRole(fuel.column) === "electricity"),
  );
  const hasUnpriceable = fuelUse.some(fuel => fuel.tco2e === null);
  const elevatorsPresent = facts.publicRecords.elevatorDevices.length > 0;

  const noteParts = [
    "Emissions are attributed from the LL84 fuel breakdown: fossil heating fuel is split between the heating plant and hot water, and electricity across cooling, lighting" +
      (elevatorsPresent ? ", elevators," : ",") +
      " and unassigned plug and process load. System shares sum to at most 1; the remainder is plug load, attributed to no system.",
  ];

  let heatingPlant = NO_EMISSIONS;
  let domesticHotWater = NO_EMISSIONS;

  if (heatingTco2e > 0) {
    heatingPlant = slice(
      heatingTco2e * heatingSplit.heatingPlant,
      pricedTotal,
      `${pct(heatingSplit.heatingPlant)} of fossil heating fuel, the typical space-heating share for ${familyName} (CBECS/RECS end-use).`,
    );
    domesticHotWater = slice(
      heatingTco2e * heatingSplit.domesticHotWater,
      pricedTotal,
      `${pct(heatingSplit.domesticHotWater)} of fossil heating fuel, the typical hot-water share for ${familyName} (CBECS/RECS end-use).`,
    );
  } else if (heatingFuel.isFossilCombustion) {
    const unpriced = unpricedHeatingExplanation(heatingFuel.source);
    heatingPlant = { tco2e: null, share: null, basis: unpriced.basis };
    domesticHotWater = { tco2e: null, share: null, basis: unpriced.basis };
    noteParts.push(unpriced.note);
  } else {
    const basis =
      "Space heating draws on the building's electricity and is not separated out; it sits in the unassigned plug remainder.";
    heatingPlant = { tco2e: null, share: null, basis };
    domesticHotWater = { tco2e: null, share: null, basis };
  }

  const cooling =
    electricityTco2e > 0
      ? slice(
          electricityTco2e * electricitySplit.cooling,
          pricedTotal,
          `${pct(electricitySplit.cooling)} of electricity, the typical cooling share for ${familyName} (CBECS end-use).`,
        )
      : NO_EMISSIONS;
  const lighting =
    electricityTco2e > 0
      ? slice(
          electricityTco2e * electricitySplit.lighting,
          pricedTotal,
          `${pct(electricitySplit.lighting)} of electricity, the typical lighting share for ${familyName} (CBECS end-use).`,
        )
      : NO_EMISSIONS;
  const elevators =
    electricityTco2e > 0 && elevatorsPresent
      ? slice(
          electricityTco2e * electricitySplit.elevators,
          pricedTotal,
          `${pct(electricitySplit.elevators)} of electricity, the typical elevator share (CBECS end-use).`,
        )
      : NO_EMISSIONS;

  if (hasUnpriceable) {
    noteParts.push(
      "Some reported fuel has no verified emissions coefficient and is left out of the priced total.",
    );
  }

  return {
    totalTco2e: round1(pricedTotal),
    note: noteParts.join(" "),
    heatingPlant,
    domesticHotWater,
    cooling,
    lighting,
    elevators,
  };
}

// Why fossil heating emissions could not be priced, worded by where the fuel
// was resolved from. A fuel the filing itself reports can be unpriceable (No.
// 5/6 oil carries no verified coefficient), while a fuel resolved from DEP CATS
// or a DOB filing is absent from the filing altogether - the wording must match
// the case, or the dossier accuses a filing of omitting a fuel it reports.
function unpricedHeatingExplanation(source: HeatingFuelResolution["source"]): {
  basis: string;
  note: string;
} {
  if (source === "ll84") {
    return {
      basis:
        "The filed heating fuel has no verified emissions coefficient, so heating and hot-water emissions cannot be priced from the filing.",
      note: "The heating fuel the LL84 filing reports has no verified emissions coefficient, so heating and hot-water emissions are unattributed and the priced total understates the building.",
    };
  }

  if (source === "cats") {
    return {
      basis:
        "The heating fuel resolved from DEP CATS is absent from the LL84 filing, so heating-plant emissions cannot be priced from it.",
      note: "The heating fuel on record (DEP CATS) does not appear in the LL84 filing, so heating and hot-water emissions are unattributed and the total below understates the building.",
    };
  }

  return {
    basis:
      "The heating fuel on record is absent from the LL84 filing, so heating-plant emissions cannot be priced from it.",
    note: "The heating fuel on record does not appear in the LL84 filing, so heating and hot-water emissions are unattributed and the total below understates the building.",
  };
}

function assessHeatingPlant(
  facts: BuildingFacts,
  asOf: Date,
  fuel: HeatingFuelResolution,
  emissions: SystemEmissions,
): SystemAssessment {
  const vintage = heatingVintage(facts);
  const condition = heatingCondition(facts, asOf, vintage.year);

  const presence: Presence =
    fuel.presence === "unknown" && vintage.year === null && condition.condition === "unknown"
      ? "unknown"
      : fuel.presence === "unknown"
        ? "assumed"
        : fuel.presence;

  return {
    system: "heating_plant",
    presence,
    headline: heatingHeadline(fuel, vintage.year),
    fuel: fuel.fuel,
    vintageYear: vintage.year,
    vintageBasis: vintage.basis,
    condition: condition.condition,
    conditionSignals: [...fuel.signals, ...condition.signals],
    estAnnualTco2e: emissions.tco2e,
    shareOfEmissions: emissions.share,
    attributionBasis: emissions.basis,
    confidence: fuel.confidence,
    evidence: dedupeEvidence([...fuel.evidence, ...vintage.evidence, ...condition.evidence]),
  };
}

interface HeatingVintage {
  year: number | null;
  basis: string | null;
  evidence: EvidenceRef[];
}

// The heating plant's install year: the latest BIS boiler permit or boiler/heat
// install job filing. CATS registration dates are deliberately excluded - they
// are operating-certificate renewals, not installations, so a 2019 recert of a
// 1990s boiler must never read as a new plant. With no install record, fall back
// to the building's year built.
function heatingVintage(facts: BuildingFacts): HeatingVintage {
  const candidates: Array<{ year: number; basis: string; evidence: EvidenceRef }> = [];

  for (const permit of facts.publicRecords.bisPermits) {
    if (permit.workType !== "BL") {
      continue;
    }
    const date = parseRecordDate(permit.issuanceDate ?? permit.filingDate);
    if (date.year === null) {
      continue;
    }
    candidates.push({
      year: date.year,
      basis: `latest BIS boiler permit (${date.year})`,
      evidence: bisPermitEvidence(permit, date.iso, `Boiler work permit issued ${date.iso ?? date.year}.`),
    });
  }

  for (const job of facts.publicRecords.bisJobs) {
    if (!describesHeatingInstall(job.description)) {
      continue;
    }
    const date = parseRecordDate(job.preFilingDate ?? job.approvedDate);
    if (date.year === null) {
      continue;
    }
    candidates.push({
      year: date.year,
      basis: `heating equipment filing (${date.year})`,
      evidence: bisJobEvidence(job, date.iso, `Heating work filed: "${snippet(job.description)}".`),
    });
  }

  if (candidates.length === 0) {
    const yearBuilt = facts.plutoCharacteristics?.yearBuilt ?? null;
    return {
      year: null,
      basis: yearBuilt !== null ? `assumed original to the ${yearBuilt} building` : null,
      evidence: yearBuilt !== null ? [plutoEraEvidence(facts)] : [],
    };
  }

  const latest = candidates.reduce((best, next) => (next.year > best.year ? next : best));
  return { year: latest.year, basis: latest.basis, evidence: [latest.evidence] };
}

interface ConditionResult {
  condition: Condition;
  signals: string[];
  evidence: EvidenceRef[];
}

// The heating plant's condition, in order of precedence: a recent install reads
// as recently replaced even over live complaints (a new plant with teething
// issues is not a failing one); then failing on a density of heat/hot-water
// failures or a boiler defect; then aging on age; then serviceable on a positive
// recent inspection; else unknown. All signals are gathered regardless of the
// label, so the tension between a fresh install and open complaints stays
// visible.
function heatingCondition(
  facts: BuildingFacts,
  asOf: Date,
  vintageYear: number | null,
): ConditionResult {
  const signals: string[] = [];
  const evidence: EvidenceRef[] = [];

  const heatViolations = heatViolationsInWindow(facts, asOf);
  const heatComplaints = heatComplaintsInWindow(facts, asOf);
  const boilerViolations = activeBoilerViolations(facts);
  const boilerDefect = boilerDefectOnRecord(facts);
  const units = facts.plutoCharacteristics?.unitsResidential ?? null;

  if (heatViolations.length > 0) {
    const classC = heatViolations.filter(violation => violation.violationClass === "C").length;
    signals.push(
      `${heatViolations.length} HPD heat and hot-water violation(s) in the last ${HEAT_SIGNAL_WINDOW_YEARS} heating seasons` +
        (classC > 0 ? `, ${classC} of them immediately hazardous (class C)` : "") +
        ".",
    );
    for (const violation of heatViolations.slice(0, 3)) {
      evidence.push(hpdViolationEvidence(violation));
    }
  }

  if (heatComplaints.length > 0) {
    signals.push(`${heatComplaints.length} HPD heat and hot-water complaint(s) over the same window.`);
    evidence.push(hpdComplaintEvidence(heatComplaints[0]));
  }

  if (boilerViolations.length > 0) {
    signals.push(`${boilerViolations.length} active DOB low-pressure boiler violation(s) on record.`);
    evidence.push(dobViolationEvidence(boilerViolations[0]));
  }

  if (boilerDefect) {
    signals.push("A DOB boiler inspection reports a defect on record.");
  }

  const recentlyReplaced =
    vintageYear !== null && asOf.getFullYear() - vintageYear <= RECENT_REPLACEMENT_YEARS;
  if (recentlyReplaced) {
    signals.unshift(`Heating equipment installed ${vintageYear}, within ${RECENT_REPLACEMENT_YEARS} years.`);
    return { condition: "recently_replaced", signals, evidence };
  }

  const eventCount = heatViolations.length + heatComplaints.length;
  const failingByDensity =
    units !== null && units > 0
      ? eventCount / units > FAILING_HEAT_EVENTS_PER_UNIT
      : heatViolations.length >= FAILING_HEAT_VIOLATIONS_WITHOUT_UNITS;
  if (failingByDensity || boilerDefect) {
    return { condition: "failing", signals, evidence };
  }

  if (vintageYear !== null && asOf.getFullYear() - vintageYear > AGING_VINTAGE_YEARS) {
    signals.push(`Heating equipment dates to ${vintageYear}, ${asOf.getFullYear() - vintageYear} years old.`);
    return { condition: "aging", signals, evidence };
  }

  const age = buildingAge(facts, asOf);
  if (vintageYear === null && age !== null && age > NO_VINTAGE_AGING_YEARS) {
    signals.push(
      `No install date on record and the building is ${age} years old, so the plant is presumed aging.`,
    );
    return { condition: "aging", signals, evidence };
  }

  if (positiveRecentInspection(facts, asOf)) {
    signals.push("A recent boiler inspection or active fuel registration shows the plant in service.");
    return { condition: "serviceable", signals, evidence };
  }

  return { condition: "unknown", signals, evidence };
}

function assessDomesticHotWater(
  facts: BuildingFacts,
  asOf: Date,
  heatingPlant: SystemAssessment,
  emissions: SystemEmissions,
): SystemAssessment {
  const distinct = distinctWaterHeater(facts);
  const hotWater = hotWaterSignals(facts, asOf);

  if (distinct) {
    return {
      system: "domestic_hot_water",
      presence: "confirmed",
      headline: distinct.year
        ? `Dedicated water heater, installed around ${distinct.year}`
        : "Dedicated water heater on record",
      fuel: null,
      vintageYear: distinct.year,
      vintageBasis: distinct.year ? `water-heater filing (${distinct.year})` : null,
      condition: hotWater.failing ? "failing" : "unknown",
      conditionSignals: hotWater.signals,
      estAnnualTco2e: emissions.tco2e,
      shareOfEmissions: emissions.share,
      attributionBasis: emissions.basis,
      confidence: "low",
      evidence: dedupeEvidence([distinct.evidence, ...hotWater.evidence]),
    };
  }

  const presence: Presence = heatingPlant.presence === "unknown" ? "unknown" : "assumed";
  if (presence === "unknown") {
    return {
      system: "domestic_hot_water",
      presence: "unknown",
      headline: "Hot water source unknown",
      fuel: null,
      vintageYear: null,
      vintageBasis: null,
      condition: "unknown",
      conditionSignals: [],
      estAnnualTco2e: emissions.tco2e,
      shareOfEmissions: emissions.share,
      attributionBasis: emissions.basis,
      confidence: "low",
      evidence: [],
    };
  }

  const sharedFuelEvidence = heatingPlant.evidence.filter(
    ref => ref.datasetId === DATASET.ll84.id || ref.datasetId === DATASET.cats.id,
  );

  return {
    system: "domestic_hot_water",
    presence: "assumed",
    headline: heatingPlant.fuel
      ? `Hot water off the ${heatingPlant.fuel} heating plant`
      : "Hot water off the building heating plant",
    fuel: heatingPlant.fuel,
    vintageYear: null,
    vintageBasis: "shares the heating plant",
    condition: hotWater.failing ? "failing" : heatingPlant.condition,
    conditionSignals: [
      "No dedicated water heater on record; hot water is assumed to come from the heating plant.",
      ...hotWater.signals,
    ],
    estAnnualTco2e: emissions.tco2e,
    shareOfEmissions: emissions.share,
    attributionBasis: emissions.basis,
    confidence: heatingPlant.confidence === "high" ? "medium" : heatingPlant.confidence,
    evidence: dedupeEvidence([...sharedFuelEvidence, ...hotWater.evidence]),
  };
}

function assessCooling(facts: BuildingFacts, emissions: SystemEmissions): SystemAssessment {
  const central = latestJobMatching(facts, CENTRAL_COOLING_PATTERN, "Cooling work filed");
  const generic = latestJobMatching(facts, GENERIC_COOLING_PATTERN, "Cooling work filed");
  const found = central ?? generic;
  const presence: Presence = central ? "confirmed" : generic ? "assumed" : "unknown";

  return {
    system: "cooling",
    presence,
    headline: central
      ? `Fixed cooling equipment on record${central.year ? ` (work filed ${central.year})` : ""}`
      : generic
        ? "Cooling system on record (type unconfirmed)"
        : "Cooling equipment unknown",
    fuel: presence === "unknown" ? null : "electricity",
    vintageYear: found?.year ?? null,
    vintageBasis: found?.year ? `cooling work filing (${found.year})` : null,
    condition: "unknown",
    conditionSignals: [],
    estAnnualTco2e: emissions.tco2e,
    shareOfEmissions: emissions.share,
    attributionBasis: emissions.basis,
    confidence: central ? "medium" : "low",
    evidence: found ? [found.evidence] : [],
  };
}

function assessEnvelope(facts: BuildingFacts, asOf: Date): SystemAssessment {
  const thermal = latestJobMatching(facts, ENVELOPE_THERMAL_PATTERN, "Envelope work filed");

  if (thermal) {
    const recent = thermal.year !== null && asOf.getFullYear() - thermal.year <= RECENT_REPLACEMENT_YEARS;
    return {
      system: "envelope",
      presence: "confirmed",
      headline: `Envelope work on record${thermal.year ? ` (${thermal.year})` : ""}`,
      fuel: null,
      vintageYear: thermal.year,
      vintageBasis: thermal.year ? `latest envelope work filing (${thermal.year})` : null,
      condition: recent ? "recently_replaced" : "serviceable",
      conditionSignals: [thermal.evidence.note],
      estAnnualTco2e: null,
      shareOfEmissions: null,
      attributionBasis: "Envelope has no metered emissions of its own; it modulates the heating load.",
      confidence: "medium",
      evidence: [thermal.evidence],
    };
  }

  const facade = latestJobMatching(facts, FACADE_PATTERN, "Facade repairs filed");
  const yearBuilt = facts.plutoCharacteristics?.yearBuilt ?? null;
  const age = buildingAge(facts, asOf);
  const aging = age !== null && age > NO_VINTAGE_AGING_YEARS;

  const signals: string[] = [];
  const evidence: EvidenceRef[] = yearBuilt !== null ? [plutoEraEvidence(facts)] : [];
  if (facade) {
    signals.push(
      `Facade repairs on record${facade.year ? ` (${facade.year})` : ""} - structural work, not a thermal upgrade.`,
    );
    evidence.push(facade.evidence);
  }
  if (aging) {
    signals.push(
      `No window, roof, or insulation upgrade on record for a ${age}-year-old building; the envelope is presumed original.`,
    );
  }

  return {
    system: "envelope",
    presence: yearBuilt !== null ? "assumed" : "unknown",
    headline:
      yearBuilt !== null
        ? `Original envelope, assumed to the ${yearBuilt} building`
        : "Envelope condition unknown",
    fuel: null,
    vintageYear: null,
    vintageBasis: yearBuilt !== null ? `assumed original to the ${yearBuilt} building` : null,
    condition: aging ? "aging" : "unknown",
    conditionSignals: signals,
    estAnnualTco2e: null,
    shareOfEmissions: null,
    attributionBasis: "Envelope has no metered emissions of its own; it modulates the heating load.",
    confidence: "low",
    evidence: dedupeEvidence(evidence),
  };
}

function assessSolarPv(facts: BuildingFacts): SystemAssessment {
  const solar = solarEvidence(facts);

  if (solar) {
    return {
      system: "solar_pv",
      presence: "confirmed",
      headline: "Rooftop solar on record",
      fuel: null,
      vintageYear: solar.year,
      vintageBasis: solar.year ? `solar permit (${solar.year})` : null,
      condition: "serviceable",
      conditionSignals: [solar.evidence.note],
      estAnnualTco2e: null,
      shareOfEmissions: null,
      attributionBasis: "On-site generation offsets purchased electricity; the LL84 filing nets it out.",
      confidence: "medium",
      evidence: [solar.evidence],
    };
  }

  return {
    system: "solar_pv",
    presence: "none",
    headline: "No rooftop solar on record",
    fuel: null,
    vintageYear: null,
    vintageBasis: null,
    condition: "unknown",
    conditionSignals: [],
    estAnnualTco2e: null,
    shareOfEmissions: null,
    attributionBasis: null,
    confidence: "low",
    evidence: [
      consultedEvidence(
        DATASET.electrical,
        "No solar installation found across DOB electrical permits and job filings.",
      ),
    ],
  };
}

function assessElevators(
  facts: BuildingFacts,
  asOf: Date,
  emissions: SystemEmissions,
): SystemAssessment {
  const devices = facts.publicRecords.elevatorDevices;

  if (devices.length === 0) {
    return {
      system: "elevators",
      presence: "none",
      headline: "No elevators on record",
      fuel: null,
      vintageYear: null,
      vintageBasis: null,
      condition: "unknown",
      conditionSignals: [],
      estAnnualTco2e: null,
      shareOfEmissions: null,
      attributionBasis: null,
      confidence: "medium",
      evidence: [
        consultedEvidence(DATASET.elevators, "No elevator devices registered for this building."),
      ],
    };
  }

  const active = devices.filter(device => (device.deviceStatus ?? "").toLowerCase() === "active").length;
  const installYear = earliestDeviceYear(devices);
  const recentInspection = devices.some(device => recentCat1Inspection(device, asOf));

  const condition: Condition =
    active === devices.length && recentInspection
      ? "serviceable"
      : installYear !== null && asOf.getFullYear() - installYear > AGING_VINTAGE_YEARS
        ? "aging"
        : "unknown";

  const signals: string[] = [];
  if (installYear !== null) {
    signals.push(`Earliest device in service since ${installYear}.`);
  }
  if (recentInspection) {
    signals.push("A Category 1 inspection is on record within the last two years.");
  }

  return {
    system: "elevators",
    presence: "confirmed",
    headline: `${devices.length} elevator${devices.length === 1 ? "" : "s"}${
      active === devices.length ? " (all active)" : `, ${active} active`
    }`,
    fuel: "electricity",
    vintageYear: installYear,
    vintageBasis: installYear !== null ? `earliest device status date (${installYear})` : null,
    condition,
    conditionSignals: signals,
    estAnnualTco2e: emissions.tco2e,
    shareOfEmissions: emissions.share,
    attributionBasis: emissions.basis,
    confidence: "high",
    evidence: devices.slice(0, 3).map(device => elevatorEvidence(device)),
  };
}

function assessElectricalService(facts: BuildingFacts): SystemAssessment {
  const upgrade = electricalServiceEvidence(facts);

  if (upgrade) {
    return {
      system: "electrical_service",
      presence: "confirmed",
      headline: `Electrical service work on record${upgrade.year ? ` (${upgrade.year})` : ""}`,
      fuel: null,
      vintageYear: upgrade.year,
      vintageBasis: upgrade.year ? `service work filing (${upgrade.year})` : null,
      condition: "serviceable",
      conditionSignals: [
        "A service upgrade is on record - a readiness signal for electrification, which draws more service.",
      ],
      estAnnualTco2e: null,
      shareOfEmissions: null,
      attributionBasis: "Electrical service capacity carries no emissions of its own.",
      confidence: "medium",
      evidence: [upgrade.evidence],
    };
  }

  return {
    system: "electrical_service",
    presence: "unknown",
    headline: "Electrical service capacity unknown",
    fuel: null,
    vintageYear: null,
    vintageBasis: null,
    condition: "unknown",
    conditionSignals: [],
    estAnnualTco2e: null,
    shareOfEmissions: null,
    attributionBasis: "Electrical service capacity carries no emissions of its own.",
    confidence: "low",
    evidence: [],
  };
}

function assessLighting(
  facts: BuildingFacts,
  asOf: Date,
  emissions: SystemEmissions,
): SystemAssessment {
  const led = latestJobMatching(facts, LED_PATTERN, "Lighting work filed");

  if (led) {
    const recent =
      led.year !== null && asOf.getFullYear() - led.year <= RECENT_REPLACEMENT_YEARS;
    return {
      system: "lighting",
      presence: "confirmed",
      headline: `LED or lighting retrofit on record${led.year ? ` (${led.year})` : ""}`,
      fuel: "electricity",
      vintageYear: led.year,
      vintageBasis: led.year ? `lighting work filing (${led.year})` : null,
      condition: recent ? "recently_replaced" : "serviceable",
      conditionSignals: [led.evidence.note],
      estAnnualTco2e: emissions.tco2e,
      shareOfEmissions: emissions.share,
      attributionBasis: emissions.basis,
      confidence: "medium",
      evidence: [led.evidence],
    };
  }

  return {
    system: "lighting",
    presence: "unknown",
    headline: "Lighting type unknown (no retrofit on record)",
    fuel: null,
    vintageYear: null,
    vintageBasis: null,
    condition: "unknown",
    conditionSignals: [],
    estAnnualTco2e: emissions.tco2e,
    shareOfEmissions: emissions.share,
    attributionBasis: emissions.basis,
    confidence: "low",
    evidence: [],
  };
}

// The heating fuel LL84 reports: the largest-energy fuel with a heating role, or
// "electricity" when the filing has electricity and no heating fuel at all, or
// null when there is no fuel detail to read.
function ll84HeatingFuel(fuelUse: Ll84FuelUse[]): { label: string | null; isElectricOnly: boolean } {
  const heating = fuelUse.filter(fuel => fuelRole(fuel.column) === "heating" && fuel.kbtu > 0);
  if (heating.length > 0) {
    const top = heating.reduce((best, next) => (next.kbtu > best.kbtu ? next : best));
    return { label: top.fuel, isElectricOnly: false };
  }

  const hasElectricity = fuelUse.some(
    fuel => fuelRole(fuel.column) === "electricity" && fuel.kbtu > 0,
  );
  if (hasElectricity) {
    return { label: "electricity", isElectricOnly: true };
  }

  return { label: null, isElectricOnly: false };
}

interface CatsFossilResolution {
  fuel: string;
  throughYear: number;
  evidence: EvidenceRef;
}

// The most recent CATS registration for a fossil fuel still within the recency
// window, bracketed by its later of issue and expiration year. This is what
// contradicts an electricity-only LL84 filing.
function recentFossilCats(cats: CatsPermit[], asOf: Date): CatsFossilResolution | null {
  let best: CatsFossilResolution | null = null;

  for (const permit of cats) {
    const fuel = catsFuelLabel(permit.primaryFuel);
    if (fuel === null) {
      continue;
    }

    const issued = recordYear(permit.issueDate);
    const expired = recordYear(permit.expirationDate);
    const throughYear = Math.max(issued ?? 0, expired ?? 0);
    if (throughYear === 0 || asOf.getFullYear() - throughYear > RECENT_FOSSIL_REGISTRATION_YEARS) {
      continue;
    }

    if (best === null || throughYear > best.throughYear) {
      best = {
        fuel,
        throughYear,
        evidence: catsEvidence(
          permit,
          `DEP CATS registers a ${fuel} boiler${expired ? `, in service through ${expired}` : ""}${
            permit.status ? ` (${permit.status.toLowerCase()})` : ""
          }.`,
        ),
      };
    }
  }

  return best;
}

function oilToGasConversion(bisJobs: BisJobFiling[]): EvidenceRef | null {
  for (const job of bisJobs) {
    if (/oil[- ]to[- ]gas|gas conversion|convert(?:ing|ed)? .* to (?:natural )?gas/i.test(job.description ?? "")) {
      const date = parseRecordDate(job.preFilingDate ?? job.approvedDate);
      return bisJobEvidence(job, date.iso, `Oil-to-gas conversion filed: "${snippet(job.description)}".`);
    }
  }
  return null;
}

function recentElectrification(facts: BuildingFacts, asOf: Date): boolean {
  return facts.publicRecords.bisJobs.some(job => {
    if (!/heat pump|electrif|air[- ]source|ground[- ]source|geothermal/i.test(job.description ?? "")) {
      return false;
    }
    const year = recordYear(job.preFilingDate ?? job.approvedDate);
    return year !== null && asOf.getFullYear() - year <= RECENT_REPLACEMENT_YEARS;
  });
}

function isOlderMultifamily(facts: BuildingFacts): boolean {
  const yearBuilt = facts.plutoCharacteristics?.yearBuilt ?? null;
  if (yearBuilt === null || yearBuilt >= PRE_ELECTRIFICATION_ERA_YEAR) {
    return false;
  }

  const units = facts.plutoCharacteristics?.unitsResidential ?? null;
  if (units !== null && units > 0) {
    return true;
  }
  return facts.occupancyGroups.some(use => /multifamily|residential|lodging|dormitory/i.test(use.group));
}

function heatViolationsInWindow(facts: BuildingFacts, asOf: Date): HpdViolation[] {
  const floor = isoYearsBefore(asOf, HEAT_SIGNAL_WINDOW_YEARS);
  return facts.publicRecords.hpdViolations.filter(violation => {
    const date = parseRecordDate(violation.novIssuedDate);
    return date.iso !== null && date.iso >= floor && describesHeatOrHotWater(violation.description);
  });
}

function heatComplaintsInWindow(facts: BuildingFacts, asOf: Date): HpdComplaintProblem[] {
  const floor = isoYearsBefore(asOf, HEAT_SIGNAL_WINDOW_YEARS);
  return facts.publicRecords.hpdComplaints.filter(complaint => {
    const date = parseRecordDate(complaint.receivedDate);
    return date.iso !== null && date.iso >= floor && isHeatCategory(complaint.majorCategory);
  });
}

interface HotWaterCondition {
  failing: boolean;
  signals: string[];
  evidence: EvidenceRef[];
}

// Hot-water-specific failures, read from violation descriptions since the
// complaint feed folds heat and hot water into one category. This lets domestic
// hot water carry its own condition when the record singles it out.
function hotWaterSignals(facts: BuildingFacts, asOf: Date): HotWaterCondition {
  const floor = isoYearsBefore(asOf, HEAT_SIGNAL_WINDOW_YEARS);
  const violations = facts.publicRecords.hpdViolations.filter(violation => {
    const date = parseRecordDate(violation.novIssuedDate);
    return date.iso !== null && date.iso >= floor && /HOT WATER|27-2031/i.test(violation.description ?? "");
  });

  const signals: string[] = [];
  const evidence: EvidenceRef[] = [];
  if (violations.length > 0) {
    signals.push(
      `${violations.length} HPD hot-water violation(s) in the last ${HEAT_SIGNAL_WINDOW_YEARS} heating seasons.`,
    );
    evidence.push(hpdViolationEvidence(violations[0]));
  }

  const units = facts.plutoCharacteristics?.unitsResidential ?? null;
  const failing =
    units !== null && units > 0
      ? violations.length / units > FAILING_HEAT_EVENTS_PER_UNIT
      : violations.length >= FAILING_HEAT_VIOLATIONS_WITHOUT_UNITS;

  return { failing, signals, evidence };
}

function activeBoilerViolations(facts: BuildingFacts): DobViolation[] {
  return facts.publicRecords.dobViolations.filter(
    violation =>
      violation.violationTypeCode !== null &&
      BOILER_VIOLATION_CODES.has(violation.violationTypeCode) &&
      (violation.violationCategory ?? "").toUpperCase().includes("ACTIVE"),
  );
}

function boilerDefectOnRecord(facts: BuildingFacts): boolean {
  const profile = facts.infrastructureProfile;
  if (!profile) {
    return false;
  }
  return (
    profile.boilerCondition === "defects_on_record" ||
    profile.boilerRecords.some(record => record.defectsExist === true)
  );
}

function positiveRecentInspection(facts: BuildingFacts, asOf: Date): boolean {
  const activeFuelReg = facts.publicRecords.catsPermits.some(permit => {
    const year = recordYear(permit.issueDate);
    return (
      (permit.status ?? "").toUpperCase() === "ACTIVE" &&
      year !== null &&
      asOf.getFullYear() - year <= 5
    );
  });

  const cleanBoiler = (facts.infrastructureProfile?.boilerRecords ?? []).some(record => {
    const year = recordYear(record.inspectionDate);
    return record.defectsExist === false && year !== null && asOf.getFullYear() - year <= 2;
  });

  return activeFuelReg || cleanBoiler;
}

function distinctWaterHeater(
  facts: BuildingFacts,
): { year: number | null; evidence: EvidenceRef } | null {
  for (const job of facts.publicRecords.bisJobs) {
    if (/water heater|hot water heater|domestic hot water|\bhwh\b/i.test(job.description ?? "")) {
      const date = parseRecordDate(job.preFilingDate ?? job.approvedDate);
      return {
        year: date.year,
        evidence: bisJobEvidence(job, date.iso, `Water-heater work filed: "${snippet(job.description)}".`),
      };
    }
  }
  return null;
}

interface JobMatch {
  year: number | null;
  evidence: EvidenceRef;
}

// The latest BIS job filing whose description matches a pattern, with an
// evidence ref carrying the given lead-in. Shared by cooling, envelope, facade,
// and lighting inference so each stays a two-line rule.
function latestJobMatching(
  facts: BuildingFacts,
  pattern: RegExp,
  lead: string,
): JobMatch | null {
  let best: JobMatch | null = null;

  for (const job of facts.publicRecords.bisJobs) {
    if (!pattern.test(job.description ?? "")) {
      continue;
    }
    const date = parseRecordDate(job.preFilingDate ?? job.approvedDate);
    if (best === null || (date.year ?? 0) > (best.year ?? 0)) {
      best = {
        year: date.year,
        evidence: bisJobEvidence(job, date.iso, `${lead}: "${snippet(job.description)}".`),
      };
    }
  }

  return best;
}

function solarEvidence(facts: BuildingFacts): { year: number | null; evidence: EvidenceRef } | null {
  const permit = (facts.infrastructureProfile?.electricalPermits ?? []).find(
    entry => entry.isSolar,
  );
  if (permit) {
    const date = parseRecordDate(permit.permitIssuedDate ?? permit.filingDate);
    return {
      year: date.year,
      evidence: electricalEvidence(
        permit.filingNumber,
        date.iso,
        `Solar electrical permit: "${snippet(permit.jobDescription)}".`,
      ),
    };
  }

  const job = latestJobMatching(facts, SOLAR_PATTERN, "Solar work filed");
  return job;
}

function electricalServiceEvidence(
  facts: BuildingFacts,
): { year: number | null; evidence: EvidenceRef } | null {
  for (const permit of facts.infrastructureProfile?.electricalPermits ?? []) {
    if (/service (?:upgrade|increase)|new service|upgrade.*service|\d+\s?amp/i.test(permit.jobDescription ?? "")) {
      const date = parseRecordDate(permit.permitIssuedDate ?? permit.filingDate);
      return {
        year: date.year,
        evidence: electricalEvidence(
          permit.filingNumber,
          date.iso,
          `Electrical service work: "${snippet(permit.jobDescription)}".`,
        ),
      };
    }
  }

  return latestJobMatching(facts, ELECTRICAL_SERVICE_PATTERN, "Electrical service work filed");
}

const BOILER_VIOLATION_CODES = new Set(["LBLVIO", "BLVIO"]);
const CENTRAL_COOLING_PATTERN = /chiller|cooling tower|central air|condenser water|air[- ]cooled/i;
const GENERIC_COOLING_PATTERN = /\ba\/?c\b|air[- ]condition|hvac|cooling/i;
const ENVELOPE_THERMAL_PATTERN = /\bwindow|\broof|insulat|air[- ]seal|weatheriz/i;
const FACADE_PATTERN = /facade|parapet|terra ?cotta|masonry|\bbrick|lintel|pointing/i;
const SOLAR_PATTERN = /\bsolar\b|photovolta|\bpv\b/i;
const ELECTRICAL_SERVICE_PATTERN = /service upgrade|amperage|electrical service/i;
const LED_PATTERN = /\bled\b|lighting (?:retrofit|upgrade|replace)|light fixture/i;

function describesHeatingInstall(description: string | null): boolean {
  return /\bboiler\b|\bburner\b|heat pump|heating (?:system|plant|equipment)|oil[- ]to[- ]gas|gas conversion/i.test(
    description ?? "",
  );
}

function describesHeatOrHotWater(description: string | null): boolean {
  return /HEAT|HOT WATER|27-2028|27-2029|27-2031/i.test(description ?? "");
}

function isHeatCategory(majorCategory: string | null): boolean {
  const upper = (majorCategory ?? "").toUpperCase();
  return upper.includes("HEAT") || upper.includes("HOT WATER");
}

function dominantUseFamily(facts: BuildingFacts): UseFamily {
  if (facts.occupancyGroups.length === 0) {
    return "other";
  }

  const dominant = [...facts.occupancyGroups]
    .sort((a, b) => b.sqft - a.sqft)[0]
    .group.toLowerCase();

  if (/multifamily|residential|lodging|dormitory/.test(dominant)) {
    return "multifamily";
  }
  if (dominant.includes("office")) {
    return "office";
  }
  if (/retail|store|mall|supermarket/.test(dominant)) {
    return "retail";
  }
  return "other";
}

function consultedDatasets(facts: BuildingFacts): string[] {
  const ids: string[] = [];
  const records = facts.publicRecords;

  if (facts.ll84FuelUse.length > 0) {
    ids.push(DATASET.ll84.id);
  }
  if (facts.plutoCharacteristics) {
    ids.push(DATASET.pluto.id);
  }
  if (records.bisPermits.length > 0) {
    ids.push(DATASET.bisPermits.id);
  }
  if (records.bisJobs.length > 0) {
    ids.push(DATASET.bisJobs.id);
  }
  if (records.dobViolations.length > 0) {
    ids.push(DATASET.dobViolations.id);
  }
  if (records.hpdViolations.length > 0) {
    ids.push(DATASET.hpdViolations.id);
  }
  if (records.hpdComplaints.length > 0) {
    ids.push(DATASET.hpdComplaints.id);
  }
  if (records.catsPermits.length > 0) {
    ids.push(DATASET.cats.id);
  }
  if (records.elevatorDevices.length > 0) {
    ids.push(DATASET.elevators.id);
  }

  return ids;
}

const CATS_FUEL_LABELS: Record<string, string> = {
  NO2FUEL: "No. 2 fuel oil",
  NO2FUELB2: "No. 2 fuel oil (B2 biodiesel)",
  NO4FUEL: "No. 4 fuel oil",
  NO6FUEL: "No. 6 fuel oil",
  NATURALGAS: "natural gas",
};

function catsFuelLabel(code: string | null): string | null {
  if (!code) {
    return null;
  }
  return CATS_FUEL_LABELS[code.toUpperCase()] ?? null;
}

const LL84_FUEL_LABELS: Record<string, string> = {
  natural_gas: "natural gas",
  fuel_oil_1: "No. 1 fuel oil",
  fuel_oil_2: "No. 2 fuel oil",
  fuel_oil_4: "No. 4 fuel oil",
  fuel_oil_5_6: "No. 5/6 fuel oil",
  diesel_2: "diesel",
  propane: "propane",
  kerosene: "kerosene",
  district_steam: "district steam",
  district_hot_water: "district hot water",
  electricity: "electricity",
};

function humanFuelLabel(label: string): string {
  return LL84_FUEL_LABELS[label] ?? label.replace(/_/g, " ");
}

const COMBUSTION_FUELS = new Set([
  "natural_gas",
  "fuel_oil_1",
  "fuel_oil_2",
  "fuel_oil_4",
  "fuel_oil_5_6",
  "diesel_2",
  "propane",
  "kerosene",
]);

function isCombustionFuel(label: string): boolean {
  return COMBUSTION_FUELS.has(label);
}

function heatingHeadline(fuel: HeatingFuelResolution, vintageYear: number | null): string {
  const plant =
    fuel.fuel === null
      ? "Heating plant, fuel unknown"
      : fuel.fuel === "electricity"
        ? "Electric heating"
        : fuel.source === "era"
          ? "Heating plant, fuel unconfirmed"
          : `${capitalize(fuel.headlineFuel)} boiler`;

  const when = vintageYear !== null ? `, installed around ${vintageYear}` : ", install date unknown";
  return `${plant}${when}`;
}

function bisPermitEvidence(permit: BisPermit, dateIso: string | null, note: string): EvidenceRef {
  return evidenceRef(
    DATASET.bisPermits,
    permit.permitSiNo ?? (permit.jobNumber || null),
    dateIso,
    note,
  );
}

function bisJobEvidence(job: BisJobFiling, dateIso: string | null, note: string): EvidenceRef {
  return evidenceRef(DATASET.bisJobs, job.jobNumber || null, dateIso, note);
}

function dobViolationEvidence(violation: DobViolation): EvidenceRef {
  const date = parseRecordDate(violation.issueDate);
  return evidenceRef(
    DATASET.dobViolations,
    violation.violationNumber || null,
    date.iso,
    `${violation.violationType ?? "DOB violation"} (${violation.violationCategory ?? "status unknown"}).`,
  );
}

function hpdViolationEvidence(violation: HpdViolation): EvidenceRef {
  const date = parseRecordDate(violation.novIssuedDate);
  return evidenceRef(
    DATASET.hpdViolations,
    violation.violationId || null,
    date.iso,
    `${violation.violationClass ? `Class ${violation.violationClass} ` : ""}HPD violation: "${snippet(violation.description)}".`,
  );
}

function hpdComplaintEvidence(complaint: HpdComplaintProblem): EvidenceRef {
  const date = parseRecordDate(complaint.receivedDate);
  return evidenceRef(
    DATASET.hpdComplaints,
    complaint.complaintId || null,
    date.iso,
    `HPD complaint: ${complaint.majorCategory ?? "issue"}${complaint.problemCode ? ` (${complaint.problemCode})` : ""}.`,
  );
}

function catsEvidence(permit: CatsPermit, note: string): EvidenceRef {
  const date = parseRecordDate(permit.issueDate);
  return evidenceRef(DATASET.cats, permit.applicationId || null, date.iso, note);
}

function elevatorEvidence(device: ElevatorDevice): EvidenceRef {
  const date = parseRecordDate(device.statusDate);
  return evidenceRef(
    DATASET.elevators,
    device.deviceNumber || null,
    date.iso,
    `Elevator ${device.deviceNumber} - ${device.deviceStatus ?? "status unknown"}.`,
  );
}

function electricalEvidence(
  filingNumber: string,
  dateIso: string | null,
  note: string,
): EvidenceRef {
  return evidenceRef(DATASET.electrical, filingNumber || null, dateIso, note);
}

function ll84HeatingEvidence(human: string, year: number | null): EvidenceRef {
  return evidenceRef(
    DATASET.ll84,
    null,
    null,
    `LL84 filing${year ? ` (${year})` : ""} reports ${human} use.`,
  );
}

function ll84ElectricOnlyEvidence(year: number | null): EvidenceRef {
  return evidenceRef(
    DATASET.ll84,
    null,
    null,
    `LL84 filing${year ? ` (${year})` : ""} reports electricity use only.`,
  );
}

function plutoEraEvidence(facts: BuildingFacts): EvidenceRef {
  const yearBuilt = facts.plutoCharacteristics?.yearBuilt ?? null;
  return evidenceRef(
    DATASET.pluto,
    facts.bbl || null,
    null,
    `Building built ${yearBuilt ?? "unknown"} per PLUTO.`,
  );
}

function consultedEvidence(dataset: { name: string; id: string }, note: string): EvidenceRef {
  return evidenceRef(dataset, null, null, note);
}

function evidenceRef(
  dataset: { name: string; id: string },
  recordId: string | null,
  date: string | null,
  note: string,
): EvidenceRef {
  return { dataset: dataset.name, datasetId: dataset.id, recordId, date, note };
}

function dedupeEvidence(refs: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  const kept: EvidenceRef[] = [];
  for (const ref of refs) {
    const key = `${ref.datasetId}|${ref.recordId ?? ""}|${ref.note}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push(ref);
  }
  return kept;
}

function earliestDeviceYear(devices: ElevatorDevice[]): number | null {
  const years = devices
    .map(device => recordYear(device.statusDate))
    .filter((year): year is number => year !== null);
  return years.length > 0 ? Math.min(...years) : null;
}

function recentCat1Inspection(device: ElevatorDevice, asOf: Date): boolean {
  if (!device.cat1ReportYear) {
    return false;
  }
  const year = Number(device.cat1ReportYear);
  return Number.isFinite(year) && asOf.getFullYear() - year <= 2;
}

function buildingAge(facts: BuildingFacts, asOf: Date): number | null {
  const yearBuilt = facts.plutoCharacteristics?.yearBuilt ?? null;
  return yearBuilt !== null ? asOf.getFullYear() - yearBuilt : null;
}

function slice(tco2e: number, total: number, basis: string): SystemEmissions {
  return {
    tco2e: round1(tco2e),
    share: total > 0 ? round3(tco2e / total) : null,
    basis,
  };
}

function sumTco2e(entries: Ll84FuelUse[]): number {
  return entries.reduce((total, entry) => total + (entry.tco2e ?? 0), 0);
}

function isoYearsBefore(asOf: Date, years: number): string {
  const floor = new Date(asOf);
  floor.setUTCFullYear(floor.getUTCFullYear() - years);
  return floor.toISOString().slice(0, 10);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

function snippet(text: string | null): string {
  if (!text) {
    return "";
  }
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
}

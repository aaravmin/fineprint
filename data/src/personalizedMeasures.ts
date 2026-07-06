// Per-building retrofit personalization. The engine's optimizer is generic: it
// minimizes cost over whatever measure catalog it is handed, with a fixed
// reduction fraction per measure. This layer is where a measure stops being a
// typical-building assumption and becomes this building's own: the systems
// dossier says what the heating plant burns, how old it is, and what condition
// it is in, and each catalog entry turns that into a building-specific emissions
// cut, a real cost, and an evidence-cited reason to do it or skip it.
//
// The headline case is the fuel switch. "Invest in heat pumps" cuts far more for
// a 1995 oil boiler that is failing than for a 2021 heat pump that is already
// electric: a dirtier fuel and a worse boiler mean more combustion to displace,
// while a recently replaced or already-electric plant is left alone entirely.
// That difference falls out of the COP model below, not out of a flat fraction.

import type { RetrofitCategory } from "../../engine/src/index.ts";
import { ELECTRICITY_TCO2E_PER_KWH, KBTU_PER_KWH, fuelRole } from "./ll84.ts";
import type {
  BuildingFacts,
  BuildingSystems,
  EvidenceRef,
  SystemAssessment,
  SystemKey,
} from "./types.ts";

type Condition = SystemAssessment["condition"];
type Applicability = "recommended" | "applicable" | "already_done" | "not_applicable";

// A cold-climate air-source heat pump's seasonal coefficient of performance:
// units of delivered heat per unit of electricity across a NYC winter. 2.8 is a
// conservative cold-climate seasonal figure (NEEP cold-climate ASHP data, NYC
// Accelerator electrification studies); ground-source runs higher, a cheap
// mini-split lower.
const SEASONAL_COP = 2.8;

// A fossil boiler's seasonal efficiency: the useful heat delivered per unit of
// fuel energy burned, by condition. A failing or aging boiler wastes more fuel
// for the same heat, so switching it out captures both the fuel change and the
// recovered waste - which is exactly why the same heat pump cuts more for a
// worse boiler. Figures bracket a typical NYC range: an old atmospheric boiler
// near 0.65, a serviceable unit 0.75, a recent condensing or well-tuned plant
// 0.85. Unknown sits at the midpoint.
const BOILER_EFFICIENCY: Record<Condition, number> = {
  failing: 0.65,
  aging: 0.65,
  serviceable: 0.75,
  recently_replaced: 0.85,
  unknown: 0.7,
};

// Steam distribution loses roughly a tenth of the boiler's output between the
// plant and the radiator (uninsulated risers, venting, mains). When the building
// runs on steam, the heat a heat pump must actually deliver to the apartments is
// that much less than the boiler produced, so the switch cuts a little more.
const STEAM_DISTRIBUTION_FACTOR = 0.9;

// Default measure life for the cost-per-tonne denominator when the master cost
// record carries no lifetime, matching the engine's 16-year abatement horizon.
const DEFAULT_MEASURE_LIFETIME_YEARS = 16;

// A measure earns "recommended" (rather than merely "applicable") when the
// system it targets is either in poor shape or a large emitter - a real problem
// worth leading with, not just a valid option. A tenth of the building's
// emissions is the "large emitter" line.
const RECOMMEND_SHARE_THRESHOLD = 0.1;

// How a boiler installed this recently reads as too new to switch out. Mirrors
// buildingSystems.ts's RECENT_REPLACEMENT_YEARS; restated here so the reason
// strings can name the window without importing a private constant.
const RECENT_REPLACEMENT_YEARS = 10;

// How a measure turns the building's systems into an emissions cut.
//   fuel_switch       - removes a fossil system's combustion tCO2e and adds back
//                       the electricity a heat pump would draw (via the COP
//                       model). The condition- and fuel-sensitive path.
//   fraction_of_system- cuts a condition-dependent fraction of one system's
//                       attributed tCO2e (a worse system has more to gain).
//   fraction_of_total - cuts a fixed fraction of the whole building, for systems
//                       with no metered emissions of their own (envelope, solar).
//                       Also the degraded fallback when attribution is missing.
type SavingsModel =
  | { model: "fuel_switch"; fossilSystems: SystemKey[]; fallbackFractionOfTotal: number }
  | {
      model: "fraction_of_system";
      failingFraction: number;
      serviceableFraction: number;
      fallbackFractionOfTotal: number;
    }
  | { model: "fraction_of_total"; fractionOfTotal: number };

// How a measure is priced. The master cost table (client/src/lib/output/
// masterMeasures.ts, generated from data/scripts/merge-measures.ts) can't be
// imported here - it lives in the client workspace - so the mid figures are
// copied in as literals, each naming the master measure_id and cost basis it
// came from. per_dwelling_unit scales by PLUTO residential units, per_sqft by
// gross floor area, per_building is a whole-building lump. engineFallbackPerSqft
// is the typical-building rate to use when the scaling base is missing.
type CostModel =
  | {
      basis: "per_dwelling_unit";
      usdPerUnit: number;
      masterBasis: string;
      engineFallbackPerSqft: number;
    }
  | { basis: "per_sqft"; usdPerSqft: number; masterBasis: string }
  | { basis: "per_building"; usd: number; masterBasis: string }
  | {
      // Priced per elevator device on record (DOB NOW: Safety). Scales by the
      // building's device count, falling back to a single device when the record
      // is silent, and to the engine's per-sqft rate when there is no floor area.
      basis: "per_elevator";
      usdPerDevice: number;
      masterBasis: string;
      engineFallbackPerSqft: number;
    };

export interface CatalogEntry {
  id: string;
  name: string;
  targetSystem: SystemKey;
  // The infrastructure category this measure groups under (heating, envelope,
  // elevators ...) - the vocabulary the owner reasons about, shared with the
  // client through the engine taxonomy. Threaded onto the personalized measure
  // so a plan never has to re-derive it from the target system.
  category: RetrofitCategory;
  // The master measure whose cost figures informed this entry, for lineage. Null
  // when the cost comes from the engine's editorial per-sqft rate instead.
  masterMeasureId: string | null;
  kind: "fuel_switch" | "efficiency" | "envelope" | "generation" | "controls";
  savings: SavingsModel;
  cost: CostModel;
  // Measure life for cost-per-tonne, from the master record where it has one.
  lifetimeYears: number;
  // Measures sharing an exclusiveGroup are mutually exclusive alternatives for
  // the same job (e.g. heat pump vs geothermal vs new steam boiler all belong to
  // "heating_primary"): a plan should pick at most one. Carried through to the
  // engine measure so the optimizer can keep them from stacking.
  exclusiveGroup?: string;
  // Whether the measure cuts emissions at all. An enabling upgrade (a panel
  // upsize that makes later electrification possible) sets this false so nothing
  // downstream credits it with a reduction it does not deliver. Absent means it
  // does reduce emissions.
  reducesEmissions?: boolean;
  // Steam-distribution measures only make sense with steam evidence on record.
  requiresSteam?: boolean;
  // Not applicable to an all-electric heating plant (a fossil-only measure such
  // as a high-efficiency gas furnace).
  requiresFossilHeating?: boolean;
  // Not applicable when the building runs on steam (a ducted-air measure such as
  // duct sealing, which a steam-radiator building does not have).
  excludedWhenSteam?: boolean;
  // Not applicable to an all-electric domestic hot water system (a fossil-only
  // water-heating measure such as a gas tankless heater).
  requiresFossilDhw?: boolean;
  // Not applicable unless the building has office use (an office-shell package).
  requiresOfficeUse?: boolean;
  // Not applicable unless elevators are on record (elevator modernization).
  requiresElevators?: boolean;
  // Procedural laws this physical measure also retires (e.g. LED completion
  // satisfies LL88), passed through to the engine measure so the plan credits it.
  satisfiesLaws?: string[];
  // The one-clause case for the measure, spliced into the why sentence.
  pitch: string;
}

export interface PersonalizedMeasure {
  id: string;
  name: string;
  targetSystem: SystemKey;
  // The measure's retrofit category, exclusivity group, and whether it reduces
  // emissions, carried straight from the catalog entry. Optional so a plan
  // persisted before categories existed still parses; a fresh plan always sets
  // category and reducesEmissions.
  category?: RetrofitCategory;
  exclusiveGroup?: string;
  reducesEmissions?: boolean;
  applicability: Applicability;
  applicabilityReason: string;
  // This building's annual cut, in tCO2e. Null for already-done, not-applicable,
  // or unpriceable buildings.
  estReductionTco2e: number | null;
  // estReductionTco2e as a fraction of the building's own emissions - what the
  // engine multiplies against. Divides by facts.annualEmissionsTco2e (the number
  // the fine math uses), never the systems dossier's priced LL84 total, which can
  // differ for unpriceable-fuel buildings.
  effectiveReductionFraction: number | null;
  capexUsd: number | null;
  capexBasis: string;
  costPerTco2eAvoided: number | null;
  why: string;
  evidence: EvidenceRef[];
}

// The one canonical catalog, bridging the engine's generic measures and the
// master cost/savings table. It carries more entries than the engine can
// enumerate at once, but the applicability filter and exclusive-group
// alternatives thin it per building, and the retrofit bridge ranks and
// truncates the survivors to the engine's enumeration cap - so the optimizer
// never sees more than it can handle. Steam and fossil entries are gated to the
// buildings they fit, so a typical all-electric building carries far fewer live
// options than the raw catalog length suggests.
export const PERSONALIZED_CATALOG: CatalogEntry[] = [
  {
    id: "heat_pump_conversion",
    name: "Cold-climate heat pump conversion",
    targetSystem: "heating_plant",
    category: "heating",
    exclusiveGroup: "heating_primary",
    masterMeasureId: "master:air_source_heat_pump",
    kind: "fuel_switch",
    savings: { model: "fuel_switch", fossilSystems: ["heating_plant"], fallbackFractionOfTotal: 0.7 },
    cost: {
      basis: "per_dwelling_unit",
      usdPerUnit: 16_500,
      masterBasis:
        "master:air_source_heat_pump midpoint of $13,000-$20,000 (2022 USD, per single-family home)",
      engineFallbackPerSqft: 24,
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    pitch: "a cold-climate heat pump replaces the on-site combustion plant",
  },
  {
    id: "heat_pump_water_heater",
    name: "Heat-pump water heater",
    targetSystem: "domestic_hot_water",
    category: "hot_water",
    exclusiveGroup: "dhw",
    masterMeasureId: "master:heat_pump_water_heater",
    kind: "fuel_switch",
    savings: {
      model: "fuel_switch",
      fossilSystems: ["domestic_hot_water"],
      fallbackFractionOfTotal: 0.08,
    },
    cost: {
      basis: "per_dwelling_unit",
      usdPerUnit: 2_450,
      masterBasis:
        "master:heat_pump_water_heater midpoint of $900-$4,000 (2022 USD, per single-family home)",
      engineFallbackPerSqft: 1.5,
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    pitch: "a heat-pump water heater electrifies domestic hot water",
  },
  {
    id: "cooling_heat_pump",
    name: "High-efficiency heat-pump cooling",
    targetSystem: "cooling",
    category: "cooling",
    masterMeasureId: null,
    kind: "efficiency",
    savings: {
      model: "fraction_of_system",
      failingFraction: 0.3,
      serviceableFraction: 0.15,
      fallbackFractionOfTotal: 0.08,
    },
    cost: {
      basis: "per_sqft",
      usdPerSqft: 9,
      masterBasis: "engine heat_pump_cooling editorial $9.00/sqft (NYC Accelerator electrification studies)",
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    pitch: "high-efficiency heat-pump cooling replaces the existing cooling load",
  },
  {
    id: "hvac_controls",
    name: "BMS scheduling and controls optimization",
    targetSystem: "heating_plant",
    category: "controls",
    masterMeasureId: null,
    kind: "controls",
    savings: {
      model: "fraction_of_system",
      failingFraction: 0.15,
      serviceableFraction: 0.08,
      fallbackFractionOfTotal: 0.06,
    },
    cost: {
      basis: "per_sqft",
      usdPerSqft: 1,
      masterBasis: "engine hvac_controls editorial $1.00/sqft (NYSERDA real-time energy management)",
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    pitch: "a control and scheduling upgrade trims the heating plant's runtime and waste",
  },
  {
    id: "led_lighting",
    name: "LED lighting completion",
    targetSystem: "lighting",
    category: "lighting",
    masterMeasureId: null,
    kind: "efficiency",
    savings: {
      model: "fraction_of_system",
      failingFraction: 0.5,
      serviceableFraction: 0.25,
      fallbackFractionOfTotal: 0.08,
    },
    cost: {
      basis: "per_sqft",
      usdPerSqft: 2.5,
      masterBasis: "engine led_lighting editorial $2.50/sqft (DOE solid-state lighting retrofit studies)",
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    satisfiesLaws: ["ll88"],
    pitch: "completing an LED lighting retrofit cuts lighting energy",
  },
  {
    id: "air_sealing",
    name: "Envelope air sealing and insulation",
    targetSystem: "envelope",
    category: "envelope",
    masterMeasureId: "master:air_sealing",
    kind: "envelope",
    savings: { model: "fraction_of_total", fractionOfTotal: 0.1 },
    cost: {
      basis: "per_sqft",
      usdPerSqft: 0.645,
      masterBasis: "master:air_sealing cost_mid $0.645/sqft (2023 USD)",
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    pitch: "envelope air sealing and insulation cut the heating and cooling load",
  },
  {
    id: "windows",
    name: "High-performance window replacement",
    targetSystem: "envelope",
    category: "envelope",
    masterMeasureId: "master:energy_star_windows",
    kind: "envelope",
    savings: { model: "fraction_of_total", fractionOfTotal: 0.1 },
    cost: {
      basis: "per_sqft",
      usdPerSqft: 15,
      // master:energy_star_windows is priced per window area, not gross floor
      // area, so scaling it against GFA would overstate by several times; the
      // engine's per-GFA editorial rate is used instead.
      masterBasis: "engine windows editorial $15.00/sqft of floor area (Urban Green Council deep-retrofit data)",
    },
    lifetimeYears: 20,
    pitch: "high-performance windows cut envelope heat loss",
  },
  {
    id: "roof_or_attic_insulation",
    name: "Roof and attic insulation",
    targetSystem: "envelope",
    category: "envelope",
    masterMeasureId: "master:attic_floor_insulation",
    kind: "envelope",
    savings: { model: "fraction_of_total", fractionOfTotal: 0.06 },
    cost: {
      basis: "per_sqft",
      usdPerSqft: 1.08,
      // Applied to gross floor area as a coarse proxy for roof area; a tall
      // building's roof is a small share of GFA, so this over-prices somewhat.
      masterBasis: "master:attic_floor_insulation cost_mid $1.08/sqft (2023 USD), applied to floor area",
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    pitch: "roof and attic insulation cut heat loss through the top of the building",
  },
  {
    id: "solar_pv",
    name: "Rooftop solar PV",
    targetSystem: "solar_pv",
    category: "solar",
    masterMeasureId: null,
    kind: "generation",
    savings: { model: "fraction_of_total", fractionOfTotal: 0.05 },
    cost: {
      basis: "per_sqft",
      usdPerSqft: 5,
      masterBasis: "engine solar_pv editorial $5.00/sqft (NYSERDA NY-Sun cost data)",
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    pitch: "rooftop solar offsets purchased electricity",
  },
  {
    id: "steam_distribution_improvements",
    name: "Steam distribution improvements",
    targetSystem: "heating_plant",
    category: "heating",
    masterMeasureId: "master:steam_distribution_improvements",
    kind: "efficiency",
    savings: {
      model: "fraction_of_system",
      failingFraction: 0.1,
      serviceableFraction: 0.05,
      fallbackFractionOfTotal: 0.06,
    },
    cost: {
      basis: "per_building",
      usd: 56_000,
      masterBasis: "master:steam_distribution_improvements cost_mid $56,000 per building (2019 USD)",
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    requiresSteam: true,
    pitch: "steam distribution improvements cut losses between the boiler and the radiators",
  },
  {
    id: "radiator_vent_control",
    name: "Radiator vent heat-loss control",
    targetSystem: "heating_plant",
    category: "controls",
    masterMeasureId: "master:radiator_vent_control",
    kind: "controls",
    savings: {
      model: "fraction_of_system",
      failingFraction: 0.08,
      serviceableFraction: 0.04,
      fallbackFractionOfTotal: 0.04,
    },
    cost: {
      basis: "per_building",
      usd: 7_750,
      masterBasis: "master:radiator_vent_control midpoint of $500-$15,000 per building",
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    requiresSteam: true,
    pitch: "radiator vent controls stop overheating and cut steam waste",
  },
  {
    id: "steam_boiler_replacement",
    name: "High-efficiency steam boiler replacement",
    targetSystem: "heating_plant",
    category: "heating",
    exclusiveGroup: "heating_primary",
    masterMeasureId: "master:steam_boiler_right_sizing",
    kind: "efficiency",
    savings: {
      model: "fraction_of_system",
      failingFraction: 0.12,
      serviceableFraction: 0.06,
      fallbackFractionOfTotal: 0.06,
    },
    cost: {
      // The installed cost of a new high-efficiency steam boiler, priced per
      // dwelling unit. Right-sizing at replacement is the incremental saving the
      // master record isolates (about -$12,000 vs like-for-like); that benefit is
      // folded into the efficiency gain here rather than booked as negative capex.
      basis: "per_dwelling_unit",
      usdPerUnit: 2_500,
      masterBasis:
        "installed high-efficiency steam boiler about $2,500/unit, with the master:steam_boiler_right_sizing right-sizing saving folded into the efficiency gain",
      engineFallbackPerSqft: 3,
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    requiresSteam: true,
    pitch:
      "a high-efficiency steam boiler replaces the aging plant, right-sized to cut the losses of an oversized boiler",
  },
  {
    id: "ground_source_heat_pump",
    name: "Ground-source (geothermal) heat pump",
    targetSystem: "heating_plant",
    category: "heating",
    exclusiveGroup: "heating_primary",
    masterMeasureId: "master:ground_source_heat_pump",
    kind: "fuel_switch",
    savings: {
      model: "fuel_switch",
      fossilSystems: ["heating_plant"],
      fallbackFractionOfTotal: 0.75,
    },
    cost: {
      basis: "per_dwelling_unit",
      usdPerUnit: 31_400,
      masterBasis:
        "master:ground_source_heat_pump midpoint of $24,000-$38,800 (2022 USD, per single-family home)",
      engineFallbackPerSqft: 30,
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    pitch:
      "a ground-source heat pump replaces the combustion plant with the deepest-efficiency electric heating",
  },
  {
    id: "gas_furnace_95_afue",
    name: "95% AFUE natural gas furnace",
    targetSystem: "heating_plant",
    category: "heating",
    exclusiveGroup: "heating_primary",
    masterMeasureId: "master:gas_furnace_95_afue",
    kind: "efficiency",
    savings: {
      model: "fraction_of_system",
      failingFraction: 0.2,
      serviceableFraction: 0.1,
      fallbackFractionOfTotal: 0.08,
    },
    cost: {
      basis: "per_dwelling_unit",
      usdPerUnit: 3_866,
      masterBasis: "master:gas_furnace_95_afue cost_mid $3,866 (2023 USD, per single-family home)",
      engineFallbackPerSqft: 4,
    },
    lifetimeYears: 21,
    requiresFossilHeating: true,
    excludedWhenSteam: true,
    pitch: "a 95% AFUE gas furnace replaces an aging forced-air furnace and cuts fuel waste",
  },
  {
    id: "duct_sealing_insulation",
    name: "Duct sealing and insulation",
    targetSystem: "heating_plant",
    category: "heating",
    masterMeasureId: "master:duct_sealing_insulation",
    kind: "efficiency",
    savings: {
      model: "fraction_of_system",
      failingFraction: 0.12,
      serviceableFraction: 0.06,
      fallbackFractionOfTotal: 0.05,
    },
    cost: {
      basis: "per_sqft",
      usdPerSqft: 3.84,
      masterBasis: "master:duct_sealing_insulation cost_mid $3.84/sqft (2023 USD)",
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    excludedWhenSteam: true,
    pitch: "sealing and insulating the ducts stops conditioned air leaking before it reaches the rooms",
  },
  {
    id: "gas_tankless_water_heater",
    name: "High-efficiency gas tankless water heater",
    targetSystem: "domestic_hot_water",
    category: "hot_water",
    exclusiveGroup: "dhw",
    masterMeasureId: "master:gas_tankless_water_heater",
    kind: "efficiency",
    savings: {
      model: "fraction_of_system",
      failingFraction: 0.15,
      serviceableFraction: 0.1,
      fallbackFractionOfTotal: 0.06,
    },
    cost: {
      basis: "per_dwelling_unit",
      usdPerUnit: 2_246,
      masterBasis: "master:gas_tankless_water_heater cost_mid $2,246 (2023 USD, per single-family home)",
      engineFallbackPerSqft: 2,
    },
    lifetimeYears: 20,
    requiresFossilDhw: true,
    pitch: "a high-efficiency gas tankless heater trims standby losses on a fossil hot-water system",
  },
  {
    id: "wall_insulation",
    name: "Drill-and-fill wall insulation",
    targetSystem: "envelope",
    category: "envelope",
    masterMeasureId: "master:wall_insulation_drill_fill",
    kind: "envelope",
    savings: { model: "fraction_of_total", fractionOfTotal: 0.06 },
    cost: {
      basis: "per_sqft",
      // master:wall_insulation_drill_fill carries no priced cost, so the engine's
      // editorial per-GFA rate stands in, applied to gross floor area as a proxy.
      usdPerSqft: 4.0,
      masterBasis: "engine wall_insulation editorial $4.00/sqft of floor area (Urban Green Council retrofit data)",
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    pitch: "drill-and-fill wall insulation cuts conductive heat loss through the walls",
  },
  {
    id: "office_shell_upgrade",
    name: "Office building envelope (shell) upgrade",
    targetSystem: "envelope",
    category: "envelope",
    masterMeasureId: "master:office_shell_upgrade",
    kind: "envelope",
    savings: { model: "fraction_of_total", fractionOfTotal: 0.12 },
    cost: {
      basis: "per_sqft",
      usdPerSqft: 22,
      masterBasis: "master:office_shell_upgrade cost_mid $22/sqft of gross floor area (2021 USD)",
    },
    lifetimeYears: DEFAULT_MEASURE_LIFETIME_YEARS,
    requiresOfficeUse: true,
    pitch: "a full office shell upgrade re-skins the envelope to cut heating and cooling load",
  },
  {
    id: "elevator_modernization",
    name: "Elevator modernization",
    targetSystem: "elevators",
    category: "elevators",
    masterMeasureId: null,
    kind: "efficiency",
    savings: {
      model: "fraction_of_system",
      failingFraction: 0.25,
      serviceableFraction: 0.12,
      // Elevator emissions are a small attributed slice; without one, a modest
      // whole-building fraction stands in.
      fallbackFractionOfTotal: 0.02,
    },
    cost: {
      basis: "per_elevator",
      usdPerDevice: 120_000,
      masterBasis: "engine elevator_modernization editorial $120,000 per device (industry modernization range)",
      engineFallbackPerSqft: 6,
    },
    lifetimeYears: 25,
    requiresElevators: true,
    pitch: "modernizing the elevators (regenerative drives, controls) cuts their electricity draw",
  },
  {
    id: "electrical_service_upgrade",
    name: "Electrical service upgrade",
    targetSystem: "electrical_service",
    category: "electrical",
    reducesEmissions: false,
    masterMeasureId: null,
    kind: "efficiency",
    // An enabling upgrade: it delivers no emissions cut on its own, so its
    // savings fraction is zero and it never reaches the optimizer as a reduction.
    // It exists in the plan to price the panel/service capacity a later
    // electrification would need.
    savings: { model: "fraction_of_total", fractionOfTotal: 0 },
    cost: {
      basis: "per_building",
      usd: 45_000,
      masterBasis: "engine electrical_service_upgrade editorial $45,000 per building (service/panel upsize)",
    },
    lifetimeYears: 30,
    pitch: "upsizing the electrical service clears the way for later heat-pump and induction electrification",
  },
];

// The procedural laws a catalog measure also retires, by measure id (LED
// completion satisfies LL88). The compliance plan and the engine both credit the
// same overlaps from here, so a measure never satisfies a law in one place and
// not the other.
const CATALOG_SATISFIES: Map<string, string[]> = new Map(
  PERSONALIZED_CATALOG.map(entry => [entry.id, entry.satisfiesLaws ?? []]),
);

export function measureSatisfiesLaws(measureId: string): string[] {
  return CATALOG_SATISFIES.get(measureId) ?? [];
}

// One building's whole catalog, personalized. Every entry is returned - the
// already-done and not-applicable ones carry the story of why they were set
// aside, which the persisted plan needs as much as the recommendations. Only
// recommended and applicable measures reach the optimizer (see retrofit.ts).
export function personalizeMeasures(
  facts: BuildingFacts,
  systems: BuildingSystems,
  asOf: Date,
): PersonalizedMeasure[] {
  const steamOnRecord = hasSteamEvidence(facts, systems);
  return PERSONALIZED_CATALOG.map(entry =>
    personalizeOne(entry, facts, systems, asOf, steamOnRecord),
  );
}

function personalizeOne(
  entry: CatalogEntry,
  facts: BuildingFacts,
  systems: BuildingSystems,
  asOf: Date,
  steamOnRecord: boolean,
): PersonalizedMeasure {
  const target = systemByKey(systems, entry.targetSystem);
  const applicability = resolveApplicability(entry, facts, systems, steamOnRecord, target);

  const savings =
    applicability.label === "recommended" || applicability.label === "applicable"
      ? computeSavings(entry, facts, systems, target, steamOnRecord)
      : { estReductionTco2e: null, effectiveReductionFraction: null, degraded: false };

  const cost = computeCapex(entry, facts);
  const costPerTco2eAvoided = costPerTonne(cost.capexUsd, savings.estReductionTco2e, entry.lifetimeYears);

  return {
    id: entry.id,
    name: entry.name,
    targetSystem: entry.targetSystem,
    category: entry.category,
    exclusiveGroup: entry.exclusiveGroup,
    reducesEmissions: entry.reducesEmissions,
    applicability: applicability.label,
    applicabilityReason: applicability.reason,
    estReductionTco2e: savings.estReductionTco2e,
    effectiveReductionFraction: savings.effectiveReductionFraction,
    capexUsd: cost.capexUsd,
    capexBasis: cost.capexBasis,
    costPerTco2eAvoided,
    why: whyString(entry, target, applicability, savings),
    evidence: measureEvidence(entry, systems, target),
  };
}

interface ApplicabilityResult {
  label: Applicability;
  reason: string;
}

// Whether the measure applies, and why. Already-done and not-applicable are
// evidence-driven dead ends; between the two live states, "recommended" is
// reserved for a system in poor shape or a large emitter, so the lead
// recommendations are the ones that matter.
function resolveApplicability(
  entry: CatalogEntry,
  facts: BuildingFacts,
  systems: BuildingSystems,
  steamOnRecord: boolean,
  target: SystemAssessment,
): ApplicabilityResult {
  const heating = systemByKey(systems, "heating_plant");
  const solar = systemByKey(systems, "solar_pv");

  if (entry.requiresSteam && !steamOnRecord) {
    return {
      label: "not_applicable",
      reason: "No steam distribution is on record for this building, so a steam-specific measure does not apply.",
    };
  }

  if (entry.excludedWhenSteam && steamOnRecord) {
    return {
      label: "not_applicable",
      reason: "This building runs on steam, so a ducted forced-air measure does not apply.",
    };
  }

  if (entry.requiresFossilHeating && heating.fuel === "electricity") {
    return {
      label: "not_applicable",
      reason: "The building already heats with electricity, so a fossil-fuel heating measure does not apply.",
    };
  }

  if (entry.requiresFossilDhw && systemByKey(systems, "domestic_hot_water").fuel === "electricity") {
    return {
      label: "not_applicable",
      reason: "Domestic hot water is already electric, so a fossil-fuel water-heating measure does not apply.",
    };
  }

  if (entry.requiresOfficeUse && !hasOfficeUse(facts)) {
    return {
      label: "not_applicable",
      reason: "This building has no office use on record, so an office-shell package does not apply.",
    };
  }

  if (entry.requiresElevators && systemByKey(systems, "elevators").presence === "none") {
    return {
      label: "not_applicable",
      reason: "No elevators are on record for this building, so an elevator measure does not apply.",
    };
  }

  if (entry.targetSystem === "solar_pv" && solar.presence !== "none") {
    return {
      label: "already_done",
      reason: `Rooftop solar is already on record${yearSuffix(solar.vintageYear)}, so there is nothing to add.`,
    };
  }

  if (entry.savings.model === "fuel_switch") {
    if (heating.fuel === "electricity") {
      return {
        label: "already_done",
        reason: "The building already heats with electricity, so there is no combustion plant to convert.",
      };
    }
    if (target.condition === "recently_replaced") {
      return {
        label: "already_done",
        reason: `The ${systemLabel(entry.targetSystem)} was replaced within the last ${RECENT_REPLACEMENT_YEARS} years${yearSuffix(
          target.vintageYear,
        )}, so a fuel switch would be premature.`,
      };
    }
  }

  if (
    (entry.targetSystem === "lighting" || entry.targetSystem === "envelope") &&
    target.condition === "recently_replaced"
  ) {
    return {
      label: "already_done",
      reason: `The ${systemLabel(entry.targetSystem)} shows a recent upgrade on record${yearSuffix(
        target.vintageYear,
      )}.`,
    };
  }

  const reason = liveReason(target);
  return { label: recommends(target) ? "recommended" : "applicable", reason };
}

// A poor-condition or high-share system is worth leading with; anything else is
// a valid but secondary option.
function recommends(target: SystemAssessment): boolean {
  if (target.condition === "failing" || target.condition === "aging") {
    return true;
  }
  return target.shareOfEmissions !== null && target.shareOfEmissions >= RECOMMEND_SHARE_THRESHOLD;
}

function liveReason(target: SystemAssessment): string {
  const conditionClause =
    target.condition === "unknown" ? "" : ` and reads as ${target.condition.replace(/_/g, " ")}`;
  const shareClause =
    target.shareOfEmissions !== null
      ? `, driving about ${pct(target.shareOfEmissions)} of the building's emissions`
      : "";
  return `${capitalize(target.headline)}${conditionClause}${shareClause}.`;
}

interface SavingsResult {
  estReductionTco2e: number | null;
  effectiveReductionFraction: number | null;
  // True when attribution was missing and a whole-building fallback fraction was
  // used - surfaced in the why string so the estimate's degradation is disclosed.
  degraded: boolean;
}

// The building-specific cut, by savings model. Fuel switch runs the COP model;
// fraction-of-system cuts a condition-scaled slice of one system's attributed
// emissions; fraction-of-total cuts a fixed slice of the whole building. The
// first two fall back to a whole-building fraction (flagged degraded) when the
// LL84 filing has no priced fuel to attribute - the 900 Grand Concourse case,
// where the filing omits the oil the building actually burns.
function computeSavings(
  entry: CatalogEntry,
  facts: BuildingFacts,
  systems: BuildingSystems,
  target: SystemAssessment,
  steamOnRecord: boolean,
): SavingsResult {
  const annual = facts.annualEmissionsTco2e;

  if (entry.savings.model === "fraction_of_total") {
    return fractionOfTotalResult(entry.savings.fractionOfTotal, annual, false);
  }

  if (entry.savings.model === "fuel_switch") {
    const reduction = fuelSwitchReduction(entry, facts, systems, steamOnRecord);
    if (reduction === null) {
      return fractionOfTotalResult(entry.savings.fallbackFractionOfTotal, annual, true);
    }
    return withFraction(reduction, annual, false);
  }

  if (target.estAnnualTco2e === null) {
    return fractionOfTotalResult(entry.savings.fallbackFractionOfTotal, annual, true);
  }

  const fraction = conditionFraction(entry.savings, target.condition);
  return withFraction(round1(target.estAnnualTco2e * fraction), annual, false);
}

// The fuel-switch cut: the fossil system's attributed tCO2e, minus the emissions
// of the electricity a heat pump would draw to deliver the same heat. The
// electricity term is where condition and fuel bite - a worse boiler delivers
// less useful heat per unit burned, so the heat pump needs less electricity and
// the net cut is larger. Returns null when the LL84 filing carries no priced
// fossil fuel for the system, so the caller can fall back honestly.
function fuelSwitchReduction(
  entry: CatalogEntry,
  facts: BuildingFacts,
  systems: BuildingSystems,
  steamOnRecord: boolean,
): number | null {
  if (entry.savings.model !== "fuel_switch") {
    return null;
  }

  const attributed = entry.savings.fossilSystems
    .map(key => systemByKey(systems, key).estAnnualTco2e)
    .filter((value): value is number => value !== null);
  if (attributed.length === 0) {
    return null;
  }
  const fossilTco2e = attributed.reduce((sum, value) => sum + value, 0);
  if (fossilTco2e <= 0) {
    return null;
  }

  const heatingFuels = facts.ll84FuelUse.filter(
    fuel => fuelRole(fuel.column) === "heating" && fuel.kbtu > 0,
  );
  const heatingKbtu = heatingFuels.reduce((sum, fuel) => sum + fuel.kbtu, 0);
  const heatingTco2e = heatingFuels.reduce((sum, fuel) => sum + (fuel.tco2e ?? 0), 0);
  if (heatingKbtu <= 0 || heatingTco2e <= 0) {
    return null;
  }

  // Back the fossil energy out of the attributed emissions using the filing's
  // own effective heating coefficient, so the kBtu we run through the COP model
  // matches the tCO2e the dossier attributed.
  const effectiveCoefficient = heatingTco2e / heatingKbtu;
  const fossilKbtu = fossilTco2e / effectiveCoefficient;

  const efficiency = BOILER_EFFICIENCY[systemByKey(systems, "heating_plant").condition];
  const distributionFactor = steamOnRecord ? STEAM_DISTRIBUTION_FACTOR : 1;
  const deliveredHeatKbtu = fossilKbtu * efficiency * distributionFactor;

  const electricityKwh = deliveredHeatKbtu / SEASONAL_COP / KBTU_PER_KWH;
  const electricityAddedTco2e = electricityKwh * ELECTRICITY_TCO2E_PER_KWH;

  const reduction = fossilTco2e - electricityAddedTco2e;
  return round1(clamp(reduction, 0, fossilTco2e));
}

function conditionFraction(
  savings: Extract<SavingsModel, { model: "fraction_of_system" }>,
  condition: Condition,
): number {
  if (condition === "failing" || condition === "aging") {
    return savings.failingFraction;
  }
  if (condition === "serviceable" || condition === "recently_replaced") {
    return savings.serviceableFraction;
  }
  return (savings.failingFraction + savings.serviceableFraction) / 2;
}

function fractionOfTotalResult(
  fraction: number,
  annual: number | null,
  degraded: boolean,
): SavingsResult {
  if (annual === null) {
    return { estReductionTco2e: null, effectiveReductionFraction: null, degraded };
  }
  return withFraction(round1(annual * fraction), annual, degraded);
}

function withFraction(
  reductionTco2e: number,
  annual: number | null,
  degraded: boolean,
): SavingsResult {
  if (annual === null || annual <= 0) {
    return { estReductionTco2e: reductionTco2e, effectiveReductionFraction: null, degraded };
  }
  // Cap the engine's fraction below 1: even a full electrification leaves grid
  // electricity and plug load behind, and an over-100% fraction would let the
  // optimizer drive emissions negative.
  const fraction = Math.min(reductionTco2e / annual, 0.95);
  return { estReductionTco2e: reductionTco2e, effectiveReductionFraction: round3(fraction), degraded };
}

interface CapexResult {
  capexUsd: number | null;
  capexBasis: string;
}

function computeCapex(entry: CatalogEntry, facts: BuildingFacts): CapexResult {
  const sqft = facts.grossFloorAreaSqft ?? 0;
  const cost = entry.cost;

  if (cost.basis === "per_building") {
    return { capexUsd: round2(cost.usd), capexBasis: `${cost.masterBasis}.` };
  }

  if (cost.basis === "per_sqft") {
    if (sqft <= 0) {
      return { capexUsd: null, capexBasis: "No floor area on record to price this per-sqft measure." };
    }
    return {
      capexUsd: round2(cost.usdPerSqft * sqft),
      capexBasis: `${cost.masterBasis}: $${fmt(cost.usdPerSqft)}/sqft x ${fmt(sqft)} sqft.`,
    };
  }

  if (cost.basis === "per_elevator") {
    // Default to a single device when the record is silent, so an elevator on the
    // building with no registered devices still carries a defensible price.
    const deviceCount = facts.publicRecords.elevatorDevices.length || 1;
    return {
      capexUsd: round2(cost.usdPerDevice * deviceCount),
      capexBasis: `${cost.masterBasis}: $${fmt(cost.usdPerDevice)} x ${fmt(deviceCount)} elevator device${
        deviceCount === 1 ? "" : "s"
      }.`,
    };
  }

  const units = facts.plutoCharacteristics?.unitsResidential ?? 0;
  if (units > 0) {
    return {
      capexUsd: round2(cost.usdPerUnit * units),
      capexBasis: `${cost.masterBasis}: $${fmt(cost.usdPerUnit)} x ${fmt(units)} residential units.`,
    };
  }
  if (sqft > 0) {
    return {
      capexUsd: round2(cost.engineFallbackPerSqft * sqft),
      capexBasis: `No residential unit count on record, so priced from the engine editorial $${fmt(
        cost.engineFallbackPerSqft,
      )}/sqft x ${fmt(sqft)} sqft.`,
    };
  }
  return {
    capexUsd: null,
    capexBasis: "No residential unit count or floor area on record to price this measure.",
  };
}

function costPerTonne(
  capexUsd: number | null,
  estReductionTco2e: number | null,
  lifetimeYears: number,
): number | null {
  if (capexUsd === null || estReductionTco2e === null || estReductionTco2e <= 0) {
    return null;
  }
  return round2(capexUsd / (estReductionTco2e * lifetimeYears));
}

function whyString(
  entry: CatalogEntry,
  target: SystemAssessment,
  applicability: ApplicabilityResult,
  savings: SavingsResult,
): string {
  if (applicability.label === "already_done" || applicability.label === "not_applicable") {
    return applicability.reason;
  }

  // An enabling measure delivers no cut of its own, so its case is the capability
  // it unlocks, not a reduction it would be dishonest to claim.
  if (entry.reducesEmissions === false) {
    return `${capitalize(target.headline)}. ${capitalize(entry.pitch)}. This is an enabling upgrade and is not counted as an emissions reduction on its own.`;
  }

  const reductionClause =
    savings.estReductionTco2e !== null
      ? `, an estimated ${fmt(savings.estReductionTco2e)} tCO2e/yr`
      : "";
  const degradedClause = savings.degraded
    ? " The LL84 filing has no priced fuel for this system, so the cut falls back to a typical whole-building fraction and is a rough estimate."
    : "";

  return `${capitalize(target.headline)}. ${capitalize(entry.pitch)}${reductionClause}.${degradedClause}`;
}

// The public records that back a measure: the target system's evidence, plus the
// heating plant's for a fuel switch that draws on it. Capped so a measure cites
// its strongest few, not a wall of permits.
function measureEvidence(
  entry: CatalogEntry,
  systems: BuildingSystems,
  target: SystemAssessment,
): EvidenceRef[] {
  const refs = [...target.evidence];
  if (entry.savings.model === "fuel_switch") {
    for (const key of entry.savings.fossilSystems) {
      if (key !== entry.targetSystem) {
        refs.push(...systemByKey(systems, key).evidence);
      }
    }
    refs.push(...systemByKey(systems, "heating_plant").evidence);
  }
  return dedupeEvidence(refs).slice(0, 3);
}

// Steam distribution shows up as district steam on the LL84 filing, a steam note
// in the heating plant's signals, or steam/radiator/riser work in the DOB job
// record. Any of the three is enough to unlock the steam-specific measures.
function hasSteamEvidence(facts: BuildingFacts, systems: BuildingSystems): boolean {
  const heating = systemByKey(systems, "heating_plant");
  if (heating.fuel !== null && /steam/i.test(heating.fuel)) {
    return true;
  }
  if (heating.conditionSignals.some(signal => /steam/i.test(signal))) {
    return true;
  }
  if (heating.evidence.some(ref => /steam|radiator|riser/i.test(ref.note))) {
    return true;
  }
  return facts.publicRecords.bisJobs.some(job => /steam|radiator|\briser\b/i.test(job.description ?? ""));
}

// Whether the building carries any office use, from the LL84 occupancy split.
// Gates the office-shell package, whose per-sqft cost only makes sense for an
// office envelope.
function hasOfficeUse(facts: BuildingFacts): boolean {
  return facts.occupancyGroups.some(group => /office/i.test(group.group));
}

function systemByKey(systems: BuildingSystems, key: SystemKey): SystemAssessment {
  const found = systems.systems.find(system => system.system === key);
  if (!found) {
    throw new Error(`systems dossier is missing the ${key} assessment`);
  }
  return found;
}

const SYSTEM_LABELS: Record<SystemKey, string> = {
  heating_plant: "heating plant",
  domestic_hot_water: "hot water system",
  cooling: "cooling system",
  envelope: "envelope",
  solar_pv: "rooftop solar",
  elevators: "elevators",
  electrical_service: "electrical service",
  lighting: "lighting",
};

function systemLabel(key: SystemKey): string {
  return SYSTEM_LABELS[key];
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

function yearSuffix(year: number | null): string {
  return year !== null ? ` (${year})` : "";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function fmt(value: number): string {
  return value.toLocaleString("en-US");
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

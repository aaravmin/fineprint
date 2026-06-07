// The orchestrator: one address in, everything Fineprint knows out.
// Chains GeoSearch -> LL84 -> covered buildings list, assembles
// BuildingFacts with provenance per field, and degrades honestly when a
// dataset is silent. Sources are injectable so tests run offline.

import { getCblEntry as realGetCblEntry, type CblEntry } from "./coveredBuildings.ts";
import { lookupBblCandidates as realLookupBblCandidates } from "./geosearch.ts";
import { fetchLl84 as realFetchLl84 } from "./ll84.ts";
import fetchBoilerRecordsByBin from "./boilers.ts";
import fetchBuildJobFilingsByBin from "./permits.ts";
import fetchOpenEcbViolationsByBin from "./ecb.ts";
import fetchPlutoByBbl from "./pluto.ts";
import fetchSolarElectricalPermitsByBin from "./electrical.ts";
import fetchFacadeFilingsByBin from "./facades.ts";
import type {
  Bbl,
  BblResult,
  Bin,
  BoilerRecord,
  BuildJobFiling,
  BuildingFacts,
  EcbViolation,
  ElectricalPermit,
  FacadeFiling,
  Ll84Facts,
  PlutoCharacteristics,
  ProvenanceNote,
  InfrastructureProfile,
} from "./types.ts";

export interface LookupSources {
  lookupBblCandidates: (address: string) => Promise<BblResult[]>;
  fetchLl84: (bbl: Bbl) => Promise<Ll84Facts | null>;
  getCblEntry: (bbl: Bbl) => CblEntry | null;
  // Optional dataset enrichers. Optional so tests can run with small
  // fakeSources that only provide the three core functions.
  fetchPlutoByBbl?: (bbl: Bbl) => Promise<PlutoCharacteristics | null>;
  fetchBoilerRecordsByBin?: (bin: Bin) => Promise<BoilerRecord[]>;
  fetchBuildJobFilingsByBin?: (bin: Bin) => Promise<BuildJobFiling[]>;
  fetchSolarElectricalPermitsByBin?: (bin: Bin) => Promise<ElectricalPermit[]>;
  fetchOpenEcbViolationsByBin?: (bin: Bin) => Promise<EcbViolation[]>;
  fetchFacadeFilingsByBin?: (bin: Bin) => Promise<FacadeFiling[]>;
}

const realSources: LookupSources = {
  lookupBblCandidates: realLookupBblCandidates,
  fetchLl84: realFetchLl84,
  getCblEntry: realGetCblEntry,
  fetchPlutoByBbl: fetchPlutoByBbl,
  fetchBoilerRecordsByBin: fetchBoilerRecordsByBin,
  fetchBuildJobFilingsByBin: fetchBuildJobFilingsByBin,
  fetchSolarElectricalPermitsByBin: fetchSolarElectricalPermitsByBin,
  fetchOpenEcbViolationsByBin: fetchOpenEcbViolationsByBin,
  fetchFacadeFilingsByBin: fetchFacadeFilingsByBin,
};

export async function lookupBuilding(
  address: string,
  sources: LookupSources = realSources,
): Promise<BuildingFacts> {
  const provenance: ProvenanceNote[] = [];

  const geo = await resolveBbl(address, sources, provenance);

  const ll84 = await sources.fetchLl84(geo.bbl);
  const cbl = sources.getCblEntry(geo.bbl);

  const plutoCharacteristics = sources.fetchPlutoByBbl
    ? await sources.fetchPlutoByBbl(geo.bbl)
    : null;
  if (plutoCharacteristics) {
    provenance.push({
      field: "plutoCharacteristics",
      source: "NYC PLUTO",
      detail: `${plutoCharacteristics.numFloors ?? "unknown"} floors, building class ${plutoCharacteristics.buildingClass ?? "unknown"}`,
    });
  }

  const infrastructureProfile = await resolveInfrastructureProfile(
    geo.bin,
    ll84,
    sources,
  );
  const openViolations = await resolveOpenViolations(geo.bin, sources, provenance);
  const facadeFilings = await resolveFacadeFilings(geo.bin, sources, provenance);

  const grossFloorAreaSqft = resolveFloorArea(ll84, cbl, provenance);
  const annualEmissionsTco2e = resolveEmissions(ll84, provenance);

  if (ll84) {
    for (const proxy of ll84.proxiedUses) {
      provenance.push({
        field: "occupancyGroups",
        source: "LL84 benchmarking disclosure",
        detail: `"${proxy.from}" is not in the rule's factor table; estimated as "${proxy.to}"`,
      });
    }

    if (ll84.unmappedUses.length > 0) {
      const excludedSqft = ll84.unmappedUses.reduce((sum, use) => sum + use.sqft, 0);
      const names = ll84.unmappedUses.map(use => `"${use.group}"`).join(", ");
      provenance.push({
        field: "occupancyGroups",
        source: "LL84 benchmarking disclosure",
        detail: `${excludedSqft.toLocaleString("en-US")} sqft of ${names} has no defensible emissions factor and was excluded from the limit calculation`,
      });
    }
  }

  const cblSource = cbl?.source ?? "DOB covered buildings list";
  provenance.push({
    field: "isLl97Covered",
    source: cblSource,
    detail: cbl
      ? "annual reference snapshot; DOB refreshes the list each filing year"
      : "BBL absent from the covered buildings list",
  });
  provenance.push({ field: "isArticle321", source: cblSource });

  return {
    bbl: geo.bbl,
    bin: geo.bin,
    address: geo.normalizedAddress,
    grossFloorAreaSqft,
    occupancyGroups: ll84?.occupancyGroups ?? [],
    annualEmissionsTco2e,
    isLl97Covered: cbl?.ll97 ?? false,
    isArticle321: cbl?.article321 ?? false,
    plutoCharacteristics,
    provenance,
    infrastructureProfile,
    openViolations,
    facadeFilings,
  };
}

async function resolveInfrastructureProfile(
  bin: Bin | null,
  ll84: Ll84Facts | null,
  sources: LookupSources,
): Promise<InfrastructureProfile> {
  const hasLl84Filing = !!ll84;
  const hasRecomputedEmissions = !!ll84?.recomputedEmissionsTco2e;

  // The boiler, build-job, and electrical datasets are BIN-keyed; with no BIN
  // there is nothing to query, so the equipment lists stay empty.
  const boilerRecords =
    bin && sources.fetchBoilerRecordsByBin
      ? await sources.fetchBoilerRecordsByBin(bin)
      : [];

  const buildJobFilings =
    bin && sources.fetchBuildJobFilingsByBin
      ? await sources.fetchBuildJobFilingsByBin(bin)
      : [];

  const electricalPermits =
    bin && sources.fetchSolarElectricalPermitsByBin
      ? await sources.fetchSolarElectricalPermitsByBin(bin)
      : [];

  const distinctBoilers = new Set(boilerRecords.map(record => record.boilerId));
  const hasPV =
    buildJobFilings.some(filing => filing.workTypes.solar) ||
    electricalPermits.some(permit => permit.isSolar);
  const recentHvacWork = buildJobFilings.some(
    filing => filing.workTypes.mechanical || filing.workTypes.boiler,
  );

  return {
    hasLl84Filing,
    ll84ReportingYear: ll84?.reportingYear ?? null,
    hasRecomputedEmissions,
    fuelTypes: ll84?.fuelMix ?? [],
    boilerRecords,
    buildJobFilings,
    electricalPermits,
    heatingFuel: ll84?.heatingFuel ?? null,
    hasPV,
    boilerCount: distinctBoilers.size,
    boilerCondition: deriveBoilerCondition(boilerRecords),
    recentHvacWork,
    efficiencyTier: deriveEfficiencyTier(ll84?.energyStarScore ?? null),
  };
}

// Any boiler with a defect on its latest reports flags the building; the
// inspection record is point-in-time evidence, not a guarantee of condition.
function deriveBoilerCondition(boilerRecords: BoilerRecord[]): string | null {
  if (boilerRecords.length === 0) {
    return null;
  }
  const anyDefect = boilerRecords.some(record => record.defectsExist === true);
  return anyDefect ? "defects_on_record" : "no_defects_on_record";
}

// ENERGY STAR score banded into a tier: 75 is the certification threshold,
// 50 the national median. Null when the filing carries no score.
function deriveEfficiencyTier(energyStarScore: number | null): string | null {
  if (energyStarScore === null) {
    return null;
  }
  if (energyStarScore >= 75) {
    return "high";
  }
  if (energyStarScore >= 50) {
    return "medium";
  }
  return "low";
}

// FISP filings are BIN-keyed; null (not empty) when the dataset can't be
// queried, so downstream code can tell "no filings" from "no answer".
async function resolveFacadeFilings(
  bin: Bin | null,
  sources: LookupSources,
  provenance: ProvenanceNote[],
): Promise<FacadeFiling[] | null> {
  if (!bin || !sources.fetchFacadeFilingsByBin) {
    return null;
  }

  const filings = await sources.fetchFacadeFilingsByBin(bin);
  provenance.push({
    field: "facadeFilings",
    source: "DOB NOW: Safety - Facades",
    detail:
      filings.length === 0
        ? "no FISP filings on record for this BIN"
        : `${filings.length} FISP filing row(s) on record`,
  });
  return filings;
}

// Open ECB violations are BIN-keyed; with no BIN there is nothing to query.
async function resolveOpenViolations(
  bin: Bin | null,
  sources: LookupSources,
  provenance: ProvenanceNote[],
): Promise<EcbViolation[]> {
  if (!bin || !sources.fetchOpenEcbViolationsByBin) {
    return [];
  }

  const violations = await sources.fetchOpenEcbViolationsByBin(bin);

  const totalBalanceDue = violations.reduce(
    (sum, violation) => sum + (violation.balanceDueUsd ?? 0),
    0,
  );
  provenance.push({
    field: "openViolations",
    source: "DOB ECB violations",
    detail:
      violations.length === 0
        ? "no open ECB violations on record for this building"
        : `${violations.length} open ECB violation(s), $${totalBalanceDue.toLocaleString("en-US")} outstanding`,
  });

  return violations;
}

// GeoSearch's top pick is sometimes a different tax lot than the one DOF
// files under (street renumbering, lot merges). Prefer the highest-ranked
// candidate that the covered buildings list actually knows — but only among
// candidates with the queried house number, so "1 Pike Street" can never
// silently become 51 Pike Street just because 51 is covered.
async function resolveBbl(
  address: string,
  sources: LookupSources,
  provenance: ProvenanceNote[],
): Promise<BblResult> {
  const candidates = await sources.lookupBblCandidates(address);

  const queriedHouseNumber = houseNumber(address);
  const knownToDof = candidates.find(
    candidate =>
      houseNumber(candidate.normalizedAddress) === queriedHouseNumber &&
      sources.getCblEntry(candidate.bbl) !== null,
  );
  const chosen = knownToDof ?? candidates[0];

  if (knownToDof && knownToDof !== candidates[0]) {
    provenance.push({
      field: "bbl",
      source: "NYC GeoSearch",
      detail: `top match (BBL ${candidates[0].bbl}) is unknown to DOF; used candidate "${chosen.normalizedAddress}" (BBL ${chosen.bbl}) from the covered buildings list instead`,
    });
  } else {
    provenance.push({ field: "bbl", source: "NYC GeoSearch" });
  }

  return chosen;
}

// Leading house number of an address, hyphenated Queens style included
// ("58-01 Grand Avenue" -> "58-01"). Empty string when there is none.
function houseNumber(address: string): string {
  return address.trim().match(/^(\d+(?:-\d+)?)/)?.[1] ?? "";
}

// The statute-coefficient recompute is what DOB's penalty math would use;
// ESPM's location-based GHG is the fallback when a fuel can't be priced.
function resolveEmissions(
  ll84: Ll84Facts | null,
  provenance: ProvenanceNote[],
): number | null {
  if (!ll84) {
    provenance.push({
      field: "annualEmissionsTco2e",
      source: "LL84 benchmarking disclosure",
      detail: "no LL84 filing found — emissions and use splits unavailable",
    });
    return null;
  }

  const filingYear = ll84.reportingYear ?? "unknown";

  if (ll84.recomputedEmissionsTco2e !== null) {
    provenance.push({
      field: "annualEmissionsTco2e",
      source: "LL84 benchmarking disclosure",
      detail: `${filingYear} filing, recomputed from fuel use with Admin Code 28-320.3.1.1 coefficients`,
    });
    return ll84.recomputedEmissionsTco2e;
  }

  const blockedBy =
    ll84.unpriceableFuels.length > 0
      ? ` (${ll84.unpriceableFuels.join(", ")} has no verified coefficient)`
      : "";
  provenance.push({
    field: "annualEmissionsTco2e",
    source: "LL84 benchmarking disclosure",
    detail: `${filingYear} filing, location-based GHG as reported${blockedBy}`,
  });
  return ll84.annualEmissionsTco2e;
}

// LL84's self-reported floor area wins when present (it is what the owner
// benchmarks against); DOF's tax-lot records back it up.
function resolveFloorArea(
  ll84: Ll84Facts | null,
  cbl: CblEntry | null,
  provenance: ProvenanceNote[],
): number | null {
  if (ll84?.grossFloorAreaSqft != null) {
    provenance.push({
      field: "grossFloorAreaSqft",
      source: "LL84 benchmarking disclosure",
      detail: `${ll84.reportingYear ?? "unknown"} filing`,
    });
    return ll84.grossFloorAreaSqft;
  }

  if (cbl?.dofGrossSqft != null) {
    provenance.push({
      field: "grossFloorAreaSqft",
      source: cbl.source,
      detail: "no LL84 filing — using DOF tax-lot square footage",
    });
    return cbl.dofGrossSqft;
  }

  provenance.push({
    field: "grossFloorAreaSqft",
    source: "none",
    detail: "no LL84 filing and no DOF record — floor area unknown",
  });
  return null;
}

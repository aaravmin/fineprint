// The orchestrator: one address in, everything Fineprint knows out.
// Chains GeoSearch -> LL84 -> covered buildings list, assembles
// BuildingFacts with provenance per field, and degrades honestly when a
// dataset is silent. Sources are injectable so tests run offline.

import { getCblEntry as realGetCblEntry, type CblEntry } from "./coveredBuildings.ts";
import { lookupBblCandidates as realLookupBblCandidates } from "./geosearch.ts";
import { fetchLl84 as realFetchLl84 } from "./ll84.ts";
import type {
  Bbl,
  BblResult,
  BuildingFacts,
  Ll84Facts,
  ProvenanceNote,
} from "./types.ts";

export interface LookupSources {
  lookupBblCandidates: (address: string) => Promise<BblResult[]>;
  fetchLl84: (bbl: Bbl) => Promise<Ll84Facts | null>;
  getCblEntry: (bbl: Bbl) => CblEntry | null;
}

const realSources: LookupSources = {
  lookupBblCandidates: realLookupBblCandidates,
  fetchLl84: realFetchLl84,
  getCblEntry: realGetCblEntry,
};

export async function lookupBuilding(
  address: string,
  sources: LookupSources = realSources,
): Promise<BuildingFacts> {
  const provenance: ProvenanceNote[] = [];

  const geo = await resolveBbl(address, sources, provenance);

  const ll84 = await sources.fetchLl84(geo.bbl);
  const cbl = sources.getCblEntry(geo.bbl);

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
    address: geo.normalizedAddress,
    grossFloorAreaSqft,
    occupancyGroups: ll84?.occupancyGroups ?? [],
    annualEmissionsTco2e,
    isLl97Covered: cbl?.ll97 ?? false,
    isArticle321: cbl?.article321 ?? false,
    provenance,
  };
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

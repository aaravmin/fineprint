// The orchestrator: one address in, everything Fineprint knows out.
// Chains GeoSearch -> LL84 -> covered buildings list, assembles
// BuildingFacts with provenance per field, and degrades honestly when a
// dataset is silent. Sources are injectable so tests run offline.

import { getCblEntry as realGetCblEntry, type CblEntry } from "./coveredBuildings.ts";
import { lookupBbl as realLookupBbl } from "./geosearch.ts";
import { fetchLl84 as realFetchLl84 } from "./ll84.ts";
import type {
  Bbl,
  BblResult,
  BuildingFacts,
  Ll84Facts,
  ProvenanceNote,
} from "./types.ts";

export interface LookupSources {
  lookupBbl: (address: string) => Promise<BblResult>;
  fetchLl84: (bbl: Bbl) => Promise<Ll84Facts | null>;
  getCblEntry: (bbl: Bbl) => CblEntry | null;
}

const realSources: LookupSources = {
  lookupBbl: realLookupBbl,
  fetchLl84: realFetchLl84,
  getCblEntry: realGetCblEntry,
};

export async function lookupBuilding(
  address: string,
  sources: LookupSources = realSources,
): Promise<BuildingFacts> {
  const provenance: ProvenanceNote[] = [];

  const geo = await sources.lookupBbl(address);
  provenance.push({ field: "bbl", source: "NYC GeoSearch" });

  const ll84 = await sources.fetchLl84(geo.bbl);
  const cbl = sources.getCblEntry(geo.bbl);

  const grossFloorAreaSqft = resolveFloorArea(ll84, cbl, provenance);

  if (ll84) {
    provenance.push({
      field: "annualEmissionsTco2e",
      source: "LL84 benchmarking disclosure",
      detail: `${ll84.reportingYear ?? "unknown"} filing, location-based GHG`,
    });

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
  } else {
    provenance.push({
      field: "annualEmissionsTco2e",
      source: "LL84 benchmarking disclosure",
      detail: "no LL84 filing found — emissions and use splits unavailable",
    });
  }

  const cblSource = cbl?.source ?? "DOB covered buildings list";
  provenance.push({
    field: "isLl97Covered",
    source: cblSource,
    detail: cbl ? undefined : "BBL absent from the covered buildings list",
  });
  provenance.push({ field: "isArticle321", source: cblSource });

  return {
    bbl: geo.bbl,
    address: geo.normalizedAddress,
    grossFloorAreaSqft,
    occupancyGroups: ll84?.occupancyGroups ?? [],
    annualEmissionsTco2e: ll84?.annualEmissionsTco2e ?? null,
    isLl97Covered: cbl?.ll97 ?? false,
    isArticle321: cbl?.article321 ?? false,
    provenance,
  };
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

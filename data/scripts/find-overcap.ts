// Scan the live LL84 disclosure dataset for buildings that are over their LL97
// emissions cap, so there is a real non-compliant building to ingest and test.
//
//   npm run find:overcap
//
// Reuses the existing LL84 parser and the emissions engine — no new compliance
// logic. Prints the over-cap buildings ranked by current (2024-2029) fine, with
// the address to feed to scripts/ingest.ts.

import { computeAllPeriods } from "../../engine/src/index.ts";
import { parseLl84Rows } from "../src/ll84.ts";

const LL84_URL = "https://data.cityofnewyork.us/resource/5zyy-y8am.json";

interface Candidate {
  bbl: string;
  address: string;
  label: string;
  borough: string;
  use: string;
  residential: boolean;
  sqft: number;
  emissions: number;
  intensity: number;
  fines: Record<string, number>;
}

async function main(): Promise<void> {
  const limit = Number(process.env.LL84_SAMPLE ?? 6000);
  const url = `${LL84_URL}?$limit=${limit}&$order=report_year DESC`;
  console.log(`Fetching ${limit} LL84 filings from the live disclosure dataset…`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`LL84 fetch failed: ${response.status} ${response.statusText}`);
  }
  const rows: Array<Record<string, string>> = await response.json();
  console.log(`  ${rows.length} rows returned`);

  const byBbl = new Map<string, Candidate>();
  let evaluated = 0;

  for (const row of rows) {
    const bbl = row.nyc_borough_block_and_lot;
    if (!bbl) {
      continue;
    }
    const facts = parseLl84Rows([row] as Parameters<typeof parseLl84Rows>[0], bbl);
    if (!facts || facts.grossFloorAreaSqft === null || facts.occupancyGroups.length === 0) {
      continue;
    }
    const emissions = facts.recomputedEmissionsTco2e ?? facts.annualEmissionsTco2e;
    if (emissions === null) {
      continue;
    }
    evaluated++;

    const periods = computeAllPeriods({
      grossFloorAreaSqft: facts.grossFloorAreaSqft,
      occupancyGroups: facts.occupancyGroups,
      annualEmissionsTco2e: emissions,
      isArticle321: false,
    });

    const fines: Record<string, number> = {};
    let overCap = false;
    for (const period of periods) {
      fines[period.period] = Math.round(period.annualFineUsd);
      if (!period.compliant) {
        overCap = true;
      }
    }
    if (!overCap) {
      continue;
    }

    // Dominant occupancy group (largest sqft) hints at Article 321 risk:
    // affordable/residential buildings face flat penalties, not the $268/tCO2e fine.
    const dominant = [...facts.occupancyGroups].sort((a, b) => b.sqft - a.sqft)[0];
    const use = dominant?.group ?? "unknown";
    const residential = /multifamily|residential|dormitory/i.test(use);

    const candidate: Candidate = {
      bbl,
      address: row.address_1 ?? facts.reportedAddress ?? "(unknown address)",
      label: facts.reportedAddress ?? row.property_name ?? "",
      borough: row.city ?? "",
      use,
      residential,
      sqft: facts.grossFloorAreaSqft,
      emissions: Math.round(emissions),
      intensity: Number((emissions / facts.grossFloorAreaSqft).toFixed(4)),
      fines,
    };
    const prev = byBbl.get(bbl);
    if (!prev || (candidate.fines["2024-2029"] ?? 0) > (prev.fines["2024-2029"] ?? 0)) {
      byBbl.set(bbl, candidate);
    }
  }

  const candidates = [...byBbl.values()].sort(
    (a, b) =>
      (b.fines["2024-2029"] ?? 0) - (a.fines["2024-2029"] ?? 0) ||
      (b.fines["2030-2034"] ?? 0) - (a.fines["2030-2034"] ?? 0),
  );

  console.log(
    `\nEvaluated ${evaluated} buildings with full data; ${candidates.length} are over-cap in at least one period.\n`,
  );
  console.log(
    "Note: fines use the LL84 self-reported floor area and ignore Article 321; the full\n" +
      "intake pipeline (PLUTO floor area + the covered-buildings list) is authoritative.\n" +
      'Prefer non-residential buildings. Ingest with: npx tsx scripts/ingest.ts "<address>, <borough>"\n',
  );
  // Lead with non-residential candidates (no Article 321 flat-penalty pathway).
  const ordered = [
    ...candidates.filter(c => !c.residential),
    ...candidates.filter(c => c.residential),
  ];
  for (const c of ordered.slice(0, 18)) {
    console.log(`${c.address}${c.borough ? `, ${c.borough}` : ""}  [${c.use}${c.residential ? ", residential→Art321 risk" : ""}]`);
    console.log(
      `  ${c.label ? `${c.label} · ` : ""}BBL ${c.bbl} · ${c.sqft.toLocaleString()} sqft (LL84) · ${c.emissions.toLocaleString()} tCO2e (${c.intensity} tCO2e/sqft)`,
    );
    console.log(
      `  fine/yr: 2024-29 $${(c.fines["2024-2029"] ?? 0).toLocaleString()} · 2030-34 $${(c.fines["2030-2034"] ?? 0).toLocaleString()} · 2035-39 $${(c.fines["2035-2039"] ?? 0).toLocaleString()}`,
    );
  }
}

main().catch((error: Error) => {
  console.error(`find-overcap failed: ${error.message}`);
  process.exitCode = 1;
});

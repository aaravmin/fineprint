# Fineprint data layer

NYC public datasets in, engine-ready building facts out. One call does the
whole pipeline:

```ts
import { lookupBuilding } from "fineprint-data";

const facts = await lookupBuilding("350 5th Avenue, Manhattan");
// { bbl, address, grossFloorAreaSqft, occupancyGroups, annualEmissionsTco2e,
//   isLl97Covered, isArticle321, provenance: [{ field, source, detail }] }
```

Every field names its source in `provenance` — the UI renders it as the
honesty footnote, agents cite it. Fields the city has no answer for are
`null`, never guessed. Use splits come back in ESPM property-type names, so
`computeFine` from the engine takes them directly.

## Datasets

| Source                                                                                                                                  | What we take                                                                                | How                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [NYC GeoSearch](https://geosearch.planninglabs.nyc/v2/search) (Pelias)                                                                  | address → BBL, normalized address, borough                                                  | live fetch, no key                                                                   |
| [LL84 benchmarking disclosure](https://data.cityofnewyork.us/resource/5zyy-y8am.json) (Socrata `5zyy-y8am`)                             | floor area, ESPM use splits, reported emissions, filing year                                | live fetch by BBL; `SOCRATA_APP_TOKEN` attached when set                             |
| [DOB Covered Buildings List](https://www.nyc.gov/site/buildings/codes/ll97-greenhouse-gas-emissions-reductions.page) (FY 2026 workbook) | LL97/LL84/LL87/LL88 coverage, LL97 compliance pathway (3 = Article 321), DOF sqft + address | committed snapshot `cbl/cbl26.json.gz` (29,173 covered BBLs from 1,048,014 BIN rows) |

The CBL snapshot is rebuilt yearly: download the new workbook, run
`python3 data/scripts/refresh-cbl.py <xlsx> data/cbl/<name>.json.gz "<edition>"`,
update the path in `src/coveredBuildings.ts`.

## Module map

- `geosearch.ts` — `lookupBbl(address)`; top match wins, throws clearly on
  no match or missing BBL
- `ll84.ts` — `fetchLl84(bbl)`; latest filing wins, "Not Available" → null,
  LL84 use names mapped to the rule's ESPM vocabulary
- `coveredBuildings.ts` — `getCblEntry(bbl)`, `isLl97Covered(bbl)`,
  `fetchArticle321Flag(bbl)`; reads the snapshot, Node-only
- `lookup.ts` — `lookupBuilding(address)`; chains everything, sources
  injectable for tests
- `tools.ts` — `dataToolDefinitions` + `executeDataTool` in Anthropic
  tool-use shape; `assess_building` adds engine fine projections. The model
  never does arithmetic.

## Testing

Parsers are pure and tested against committed fixtures (real recorded
responses), so `npm test` runs offline — CI never touches the network.
The orchestrator and tool layer take injected sources in tests.

```bash
npm test --workspace data
npx tsx scripts/ingest.ts "350 5th Avenue, Manhattan"   # live end-to-end into Supabase
```

## Emissions: recomputed, not just quoted

ESPM's "location-based GHG" prices electricity with national eGRID factors;
DOB's penalty math uses the statute's coefficients (Admin Code 28-320.3.1.1).
The parser recomputes emissions from the filing's fuel columns the DOB way —
for the Empire State Building that's 12,097 tCO2e instead of 16,678, which
halves the projected 2030 fine. When a consumed fuel has no verified
coefficient (no. 5/6 oil, district hot/chilled water, on-site generation),
the recompute aborts and the as-filed figure is used, with the blocking fuel
named in provenance. DOB's own calculation also applies deductions and
amendments this layer doesn't model — still an estimate, but the right kind.

## Known limitations

- The CBL is "provided for reference only" — DOB's words — and a year stale
  between editions. Disputes and new buildings won't show until refresh
  (every result carries a provenance note saying so).
- GeoSearch's top lot is cross-checked against the CBL: a same-house-number
  candidate that DOF knows wins over an unknown top match. Different house
  numbers never substitute.
- One BBL can hold several buildings (BINs); facts aggregate to the lot.
- Browser can't import `coveredBuildings.ts` (filesystem read); the
  dashboard reads building rows from Supabase instead.

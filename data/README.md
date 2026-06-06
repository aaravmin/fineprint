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
npx tsx scripts/ingest.ts "350 5th Avenue, Manhattan"   # live end-to-end into SpacetimeDB
```

## Known limitations

- LL84 location-based GHG is the emissions figure; DOB's LL97 calculation
  applies its own fuel coefficients and deductions, so treat it as the best
  public estimate, not the filed number.
- The CBL is "provided for reference only" — DOB's words — and a year stale
  between editions. Disputes and new buildings won't show until refresh.
- One BBL can hold several buildings (BINs); facts aggregate to the lot.
- Browser can't import `coveredBuildings.ts` (filesystem read); the
  dashboard reads building rows from SpacetimeDB instead.

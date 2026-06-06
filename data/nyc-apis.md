# NYC data sources (P1)

Seeded JSON is the P0 path. These are the real lookups to wire next.

## Address → BBL

- **NYC GeoSearch** (Pelias): `https://geosearch.planninglabs.nyc/v2/search?text=<address>`
  Free, no key. Response `properties.addendum.pad.bbl` gives the BBL.

## Building facts + obligations

- **LL84 benchmarking disclosure** (Socrata SODA): dataset `5zyy-y8am` on
  `data.cityofnewyork.us`. Gross floor area, energy/water use, GHG intensity by BBL.
  Use to derive sqft and a real LL97 emissions overage instead of the stub formula.
- **DOB NOW / BIS datasets**: FISP (LL11) filing status, facade cycle/sub-cycle by block.
- **LL97 covered buildings list** (NYC DOB): published annually; authoritative
  applicability instead of the sqft heuristic.
- **HPD affordable housing datasets**: ground truth for the Article 321 flag.

## Notes

- SODA endpoints allow ~1000 req/hr unauthenticated; an app token raises limits.
- BBL is the join key across all of these.
- Fine math: LL97 = $268/tCO2e over limit; LL84 = $500/quarter; FISP failure-to-file
  has its own civil penalty schedule. Keep formulas in `spacetimedb/src/laws.ts`.

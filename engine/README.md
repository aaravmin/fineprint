# Fineprint engine

Deterministic NYC Local Law 97 fine calculator. Pure TypeScript, zero runtime
dependencies. This package is the single source of every number Fineprint
shows users — the LLM never does arithmetic.

All functions are pure: same input, same output. No clocks, no network, no
environment variables. Money is computed in integer cents internally and
exposed as USD numbers; emissions are tCO2e. Rounding happens only at the
boundary: tCO2e values to two decimals (matching DOB's published example),
money to the cent.

## Interface

```ts
import { computeFine, computeAllPeriods } from "fineprint-engine";

const result = computeFine(
  {
    grossFloorAreaSqft: 45_000,
    occupancyGroups: [
      { group: "Multifamily Housing", sqft: 40_000 },
      { group: "Retail Store", sqft: 5_000 },
    ],
    annualEmissionsTco2e: 320,
  },
  "2024-2029",
);
```

`computeFine(building, period)` returns a `FineResult` for one compliance
period. `computeAllPeriods(building)` returns all three (`2024-2029`,
`2030-2034`, `2035-2039`) in order.

The `group` string accepts either an ESPM property type (the names DOB
actually computes against, e.g. `"Multifamily Housing"`, `"Office"` — full
list in `src/constants.ts`) or a statutory occupancy-group letter (`"A"`,
`"B"`, `"R-2"`, ...). Prefer ESPM property types: the letter tables are the
statute's coarser fallback and produce an estimate note. Mixed-use buildings
list one entry per use; the limit is the sum of factor times area per use.

`FineResult.notes` carries every honesty caveat (estimate pathways, unofficial
mappings). The UI should render these verbatim as the footnote.

`isArticle321: true` switches to the rent-regulated/affordable pathway:
no dollar fine, `pathway: "article321"`, and the 2030 limit reported as the
future target. Detecting whether a building qualifies is the `data` branch's
job — the engine only honors the flag.

## Constant sources

| Constant                          | Value                                                             | Source                                                                                                                                        | Verified                                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Penalty rate                      | $268 per tCO2e over the limit, per year                           | 1 RCNY 103-14(h), [rule PDF](https://www.nyc.gov/assets/buildings/rules/1_RCNY_103-14.pdf); implements Admin Code §28-320.6                   | 2026-06-06, verbatim from rule text                                                                                                   |
| ESPM factors, 2024-2029           | 60 property types, e.g. Office 0.00758                            | 1 RCNY 103-14(d)(3)(i)                                                                                                                        | 2026-06-06, transcribed verbatim                                                                                                      |
| ESPM factors, 2030-2034           | e.g. Office 0.002690852                                           | 1 RCNY 103-14(d)(3)(iii)                                                                                                                      | 2026-06-06, transcribed verbatim                                                                                                      |
| ESPM factors, 2035-2039           | e.g. Office 0.001652340                                           | 1 RCNY 103-14(d)(3)(iv)                                                                                                                       | 2026-06-06, transcribed verbatim                                                                                                      |
| Occupancy-group limits, 2024-2029 | 10 statutory rows                                                 | Admin Code [§28-320.3.1](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-158939)                                      | 2026-06-06                                                                                                                            |
| Occupancy-group limits, 2030-2034 | 10 statutory rows                                                 | Admin Code §28-320.3.2                                                                                                                        | 2026-06-06                                                                                                                            |
| Occupancy-group limits, 2035-2039 | none exist                                                        | —                                                                                                                                             | UNVERIFIED: engine maps each letter to a proxy ESPM type (`OCCUPANCY_GROUP_ESPM_PROXY`); the mapping is editorial, flagged in `notes` |
| Article 321 mechanics             | one-time compliance, no $268/tCO2e, flat $10k penalties           | Admin Code §§28-321.1–321.3; [DOB Article 321 Filing Guide v1.7](https://www.nyc.gov/assets/buildings/pdf/321_filing_guide.pdf)               | 2026-06-06; flat penalties not modeled                                                                                                |
| Golden example                    | 45,000 sf mixed-use, limit 302.41 tCO2e, actual 287.00, compliant | [DOB "Calculating Building Emissions & Emission Limits", June 26 2024](https://www.nyc.gov/assets/buildings/pdf/ll97_emissions.pdf), slide 25 | 2026-06-06                                                                                                                            |
| Rounding convention               | none mandated                                                     | full-text search of 1 RCNY 103-14                                                                                                             | 2026-06-06; engine rounds tCO2e to 2 decimals at the boundary only, matching the DOB example's display                                |

## Known limitations

- Emissions recomputation from fuel use (kBtu, kWh, fuel coefficients) happens
  in the `data` branch, not here. The engine takes `annualEmissionsTco2e` as
  given.
- DOB's published worked example is a compliant building; no official example
  with a nonzero dollar penalty exists. The penalty branch is tested against
  the rule's formula text, not a published dollar figure.
- For 2024-2029 reporting, the rule lets owners use statutory occupancy-group
  limits only for calendar years 2024 and 2025 (1 RCNY 103-14(d)(3)(ii));
  ESPM property-type factors govern otherwise. Letter-group inputs always get
  an estimate note for this reason.
- The statute bundles "B (civic admin/non-production lab/ambulatory health),
  H, I-2, I-3" at one coefficient. A bare `"B"` input means general group B;
  the special B sub-buckets need the ESPM property type.
- Article 321's flat $10,000 penalties, deadlines, and mitigation grounds are
  not modeled — the result is a zero-fine pathway marker plus notes.
- Penalty mitigation, good-faith reductions, and the separate $0.50/sqft/month
  failure-to-file penalty (1 RCNY 103-14(g)) are out of scope.

## Commands

```bash
npm test --workspace engine        # vitest, 22 tests including the DOB golden example
npm run typecheck --workspace engine
```

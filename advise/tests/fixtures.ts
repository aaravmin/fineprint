// Golden math fixture for the retrofit optimizer.
//
// A synthetic 100,000 sqft, 100-unit, all-gas multifamily building emitting a
// flat 1,000 tCO2e/yr in every period (held flat so the by-hand arithmetic is
// transparent; the real engine drops electricity factors over time, but this
// fixture's emissions are gas, which the statute holds ~flat). The FineResult
// limits below are hard-coded so the optimizer test is independent of engine
// internals. See the FULL hand calculation in the comments under GOLDEN_EXPECTED.

import type { FineResult, Period } from '../../engine/src/index.ts';
import type { Measure, RebateProgram } from '../src/catalogs/types.ts';

/** Engine output for the fixture (period limits hard-coded; actual = 1000 flat). */
export const GOLDEN_FINES: FineResult[] = [
  {
    period: '2024-2029',
    emissionsLimitTco2e: 800,
    actualEmissionsTco2e: 1000,
    overageTco2e: 200,
    annualFineUsd: 53600, // 268 × 200
    compliant: false,
    pathway: 'standard',
    notes: [],
  },
  {
    period: '2030-2034',
    emissionsLimitTco2e: 400,
    actualEmissionsTco2e: 1000,
    overageTco2e: 600,
    annualFineUsd: 160800, // 268 × 600
    compliant: false,
    pathway: 'standard',
    notes: [],
  },
  {
    period: '2035-2039',
    emissionsLimitTco2e: 250,
    actualEmissionsTco2e: 1000,
    overageTco2e: 750,
    annualFineUsd: 201000, // 268 × 750
    compliant: false,
    pathway: 'standard',
    notes: [],
  },
];

/**
 * 3-measure catalog used by the golden test (production uses all 7). The mid
 * reduction = (low + high) / 2: heat-pump 50%, controls 20%, lighting 5%.
 * NOTE: lighting is given gas/oil/steam fuel applicability HERE (fixture-only)
 * so the 3-measure all-gas hand calc enumerates cleanly; the production catalog
 * scopes lighting to electric.
 */
export const GOLDEN_MEASURES: Measure[] = [
  {
    key: 'heat-pump',
    name: 'Heat pump',
    appliesToFuel: ['gas', 'oil', 'steam'],
    emissionsReductionPctLow: 40,
    emissionsReductionPctHigh: 60,
    typicalCostPerUnitUSDMax: 30000,
    typicalCostNote: 'fixture',
    url: '',
  },
  {
    key: 'controls',
    name: 'Controls',
    appliesToFuel: ['gas', 'oil', 'steam'],
    emissionsReductionPctLow: 15,
    emissionsReductionPctHigh: 25,
    typicalCostPerUnitUSDMax: 1000,
    typicalCostNote: 'fixture',
    url: '',
  },
  {
    key: 'lighting',
    name: 'Lighting',
    appliesToFuel: ['electric', 'gas', 'oil', 'steam'],
    emissionsReductionPctLow: 2,
    emissionsReductionPctHigh: 8,
    typicalCostPerUnitUSDMax: 200,
    typicalCostNote: 'fixture',
    url: '',
  },
];

/** One $5k/unit as-of-right cash heat-pump rebate; nothing for controls/lighting. */
export const GOLDEN_REBATES: RebateProgram[] = [
  {
    name: 'Fixture HP rebate',
    administrator: 'fixture',
    measures: ['heat-pump'],
    appliesToMultifamily: true,
    incomeEligibleBonus: false,
    amount: '$5,000/unit',
    amountNumericMaxUSD: 5000,
    status: 'active',
    sunsetDate: null,
    url: '',
    cashEligible: true,
    asOfRight: true,
  },
];

export const GOLDEN_INPUT = {
  fines: GOLDEN_FINES,
  fuels: ['gas'],
  units: 100,
  isMultifamily: true,
  affordable: false,
  targetPeriod: '2030-2034' as Period,
};

/**
 * Hand-checked expectations. Full derivation:
 *
 * MACC (standalone, on the 1000 tCO2e base; mid reduction; net capex = perUnit×100 − bestCashRebate×100):
 *   heat-pump: 1000 × 0.50 = 500 tCO2e; net (30000−5000)×100 = 2,500,000 → 5,000 $/tCO2e
 *   controls : 1000 × 0.20 = 200 tCO2e; net 1000×100        =   100,000 →   500 $/tCO2e
 *   lighting : 1000 × 0.05 =  50 tCO2e; net  200×100        =    20,000 →   400 $/tCO2e
 *   MACC ascending: [lighting (400), controls (500), heat-pump (5000)]
 *
 * Period year-spans within the 2024..2050 horizon: 2024-2029 = 6y, 2030-2034 = 5y, 2035-2039(→2050) = 16y.
 * TCO(subset) = Σ net capex + Σ_period [ max(0, residual−limit) × 268 × years ]. (energy term = 0)
 * Residual emissions compound: 1000 × Π(1 − pct_i), order-independent.
 *
 * do-nothing (∅): residual 1000.
 *   2024-2029: 268×200×6 =   321,600
 *   2030-2034: 268×600×5 =   804,000
 *   2035-2050: 268×750×16 = 3,216,000
 *   TCO = 4,341,600   (do-nothing baseline; finesAvoided measured against its fine portion)
 *
 * {heat-pump}: residual 1000×0.50 = 500.
 *   2024-2029: max(0,500−800)=0 → 0
 *   2030-2034: max(0,500−400)=100 → 268×100×5 = 134,000
 *   2035-2050: max(0,500−250)=250 → 268×250×16 = 1,072,000
 *   net capex 2,500,000 → TCO = 3,706,000  (does NOT meet 2030-2034 limit: 500 > 400)
 *
 * {heat-pump, controls}: residual 1000×0.50×0.80 = 400.
 *   2030-2034: max(0,400−400)=0 → 0   ← meets the 2030-2034 target exactly
 *   2035-2050: max(0,400−250)=150 → 268×150×16 = 643,200
 *   net capex 2,600,000 → TCO = 3,243,200  (qualifies)
 *
 * {heat-pump, controls, lighting}: residual 1000×0.50×0.80×0.95 = 380.
 *   2030-2034: max(0,380−400)=0 → 0
 *   2035-2050: max(0,380−250)=130 → 268×130×16 = 557,440
 *   net capex 2,620,000 → TCO = 3,177,440  (qualifies; MINIMUM among qualifying subsets)
 *
 * Adding lighting (net $20k) avoids 643,200 − 557,440 = $85,760 of 2035-2050 fines: strongly net-positive,
 * so the optimal qualifying subset is the full 3 at TCO 3,177,440.
 *
 * totalFinesAvoided = do-nothing fine portion (4,341,600) − optimal fine portion (557,440) = 3,784,160.
 * capex = gross 3,120,000 (30000+1000+200 = 31,200 /unit × 100) − heat-pump rebate 500,000 = 2,620,000.
 */
export const GOLDEN_EXPECTED = {
  maccSortedKeys: ['lighting', 'controls', 'heat-pump'],
  maccCostPerTon: { lighting: 400, controls: 500, 'heat-pump': 5000 } as Record<string, number>,
  maccTonsReduced: { lighting: 50, controls: 200, 'heat-pump': 500 } as Record<string, number>,
  chosenMeasureKeys: ['heat-pump', 'controls', 'lighting'],
  capexUSD: 2620000, // gross 3,120,000 − rebate 500,000
  residualEmissionsTco2e: 380, // 2030-2034 basis, 1000 × .5 × .8 × .95
  tcoUSD: 3177440,
  totalFinesAvoidedUSD: 3784160,
  doNothingTcoUSD: 4341600,
};

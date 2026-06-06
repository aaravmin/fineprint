import { describe, it, expect } from 'vitest';
import { computeCandidateFixes, type RoiContext } from '../src/roi.ts';
import type { FineResult } from '../../engine/src/index.ts';
import type { Measure, RebateProgram } from '../src/catalogs/types.ts';

// --- Golden fixtures (self-contained; mirror the P1 plan's lib/optimize/fixtures) ---
// A gas, over-cap multifamily building: 1000 tCO2e actual, 600 tCO2e over the
// 2030-2034 cap. annualFineUsd = overage × $268 = 160,800, matching the engine.
const GOLDEN_FINES: FineResult[] = [
  {
    period: '2024-2029',
    emissionsLimitTco2e: 800,
    actualEmissionsTco2e: 1000,
    overageTco2e: 200,
    annualFineUsd: 200 * 268,
    compliant: false,
    pathway: 'standard',
    notes: [],
  },
  {
    period: '2030-2034',
    emissionsLimitTco2e: 400,
    actualEmissionsTco2e: 1000,
    overageTco2e: 600,
    annualFineUsd: 600 * 268,
    compliant: false,
    pathway: 'standard',
    notes: [],
  },
  {
    period: '2035-2039',
    emissionsLimitTco2e: 300,
    actualEmissionsTco2e: 1000,
    overageTco2e: 700,
    annualFineUsd: 700 * 268,
    compliant: false,
    pathway: 'standard',
    notes: [],
  },
];

const GOLDEN_MEASURES: Measure[] = [
  {
    key: 'heat-pump',
    name: 'Heat Pump System',
    appliesToFuel: ['gas', 'oil', 'steam'],
    emissionsReductionPctLow: 40,
    emissionsReductionPctHigh: 60, // mid 50%
    typicalCostPerUnitUSDMax: 30000,
    typicalCostNote: 'Per dwelling unit, installed',
    url: 'https://example.com/heat-pump',
  },
  {
    key: 'controls',
    name: 'Boiler / BMS Controls',
    appliesToFuel: ['gas', 'oil', 'steam'],
    emissionsReductionPctLow: 15,
    emissionsReductionPctHigh: 25, // mid 20%
    typicalCostPerUnitUSDMax: null,
    typicalCostNote: 'Building-specific',
    url: 'https://example.com/controls',
  },
  {
    key: 'lighting',
    name: 'LED Lighting Upgrade',
    appliesToFuel: ['any'],
    emissionsReductionPctLow: 2,
    emissionsReductionPctHigh: 8, // mid 5%
    typicalCostPerUnitUSDMax: 200,
    typicalCostNote: 'Per dwelling unit, installed',
    url: 'https://example.com/lighting',
  },
  {
    // electric-only measure: must NOT appear for a gas-only building.
    key: 'solar-pv',
    name: 'Rooftop Solar PV',
    appliesToFuel: ['electric'],
    emissionsReductionPctLow: 3,
    emissionsReductionPctHigh: 15,
    typicalCostPerUnitUSDMax: 5000,
    typicalCostNote: 'Per dwelling unit',
    url: 'https://example.com/solar',
  },
];

const GOLDEN_REBATES: RebateProgram[] = [
  {
    name: 'NYS Clean Heat',
    administrator: 'NYSERDA',
    measures: ['heat-pump', 'heat-pump-water-heater'],
    appliesToMultifamily: true,
    incomeEligibleBonus: true,
    amount: '$5,000 per system',
    amountNumericMaxUSD: 5000,
    status: 'active',
    sunsetDate: null,
    url: 'https://cleanheat.ny.gov',
  },
];

const ctx: RoiContext = { units: 100, isMultifamily: true, affordable: false, fuels: ['gas'] };

describe('computeCandidateFixes', () => {
  const fixes = computeCandidateFixes(GOLDEN_FINES, GOLDEN_MEASURES, GOLDEN_REBATES, '2030-2034', ctx);

  it('returns one candidate per fuel-applicable measure', () => {
    expect(fixes.map(f => f.measureKey).sort()).toEqual(['controls', 'heat-pump', 'lighting']);
  });

  it('excludes measures that do not apply to building fuels (electric-only for gas building)', () => {
    expect(fixes.find(f => f.measureKey === 'solar-pv')).toBeUndefined();
  });

  it('computes tCO2eReduced as mid-pct of plan-period emissions (1000)', () => {
    const hp = fixes.find(f => f.measureKey === 'heat-pump')!;
    expect(hp.tCO2eReduced).toBeCloseTo(500, 6); // 1000 × 0.50
  });

  it('bounds avoided fine by the plan-period overage (600 tCO2e)', () => {
    const hp = fixes.find(f => f.measureKey === 'heat-pump')!;
    // min(500, 600) × 268 = 134,000
    expect(hp.fineAvoidedUSD).toBeCloseTo(134000, 2);
  });

  it('caps avoided fine at the overage a measure actually removes (large-cut fix capped at full fine)', () => {
    // A measure cutting > the 600 tCO2e overage avoids exactly the full 2030 fine, no more.
    const bigMeasure: Measure = {
      key: 'big',
      name: 'Deep retrofit',
      appliesToFuel: ['gas'],
      emissionsReductionPctLow: 80,
      emissionsReductionPctHigh: 80, // 80% of 1000 = 800 tCO2e > 600 overage
      typicalCostPerUnitUSDMax: null,
      typicalCostNote: '',
      url: 'x',
    };
    const c = computeCandidateFixes(GOLDEN_FINES, [bigMeasure], GOLDEN_REBATES, '2030-2034', ctx);
    const big = c.find(x => x.measureKey === 'big')!;
    // min(800, 600) × 268 = 160,800 = the full 2030-2034 annual fine.
    expect(big.fineAvoidedUSD).toBeCloseTo(600 * 268, 2);
    expect(big.fineAvoidedUSD).toBeCloseTo(GOLDEN_FINES[1].annualFineUsd, 2);
  });

  it('avoided fine for every candidate is <= the plan-period fine', () => {
    const fine = GOLDEN_FINES[1].annualFineUsd;
    for (const c of fixes) {
      expect(c.fineAvoidedUSD).toBeLessThanOrEqual(fine + 0.01);
    }
  });

  it('nets the single best per-unit cash rebate, scaled by units', () => {
    const hp = fixes.find(f => f.measureKey === 'heat-pump')!;
    // gross 30,000×100 = 3,000,000; rebate 5,000×100 = 500,000; net 2,500,000
    expect(hp.grossCostUSD).toBe(3000000);
    expect(hp.netCostUSD).toBe(2500000);
    expect(hp.matchedRebates[0].amountShort).toMatch(/\$5k\/unit/);
  });

  it('heat-pump candidate has at least one matched rebate', () => {
    const hp = fixes.find(f => f.measureKey === 'heat-pump')!;
    expect(hp.matchedRebates.length).toBeGreaterThanOrEqual(1);
  });

  it('computes payback = netCost / annual avoided fine', () => {
    const hp = fixes.find(f => f.measureKey === 'heat-pump')!;
    expect(hp.paybackYears).toBeCloseTo(2500000 / 134000, 4);
  });

  it('sorts by payback ascending (cheapest-to-pay-back first; nulls last)', () => {
    const paybacks = fixes.map(f => f.paybackYears ?? Infinity);
    expect([...paybacks]).toEqual([...paybacks].sort((a, b) => a - b));
  });

  it('nulls unit-scaled costs when units is null', () => {
    const f2 = computeCandidateFixes(GOLDEN_FINES, GOLDEN_MEASURES, GOLDEN_REBATES, '2030-2034', {
      ...ctx,
      units: null,
    });
    const hp = f2.find(f => f.measureKey === 'heat-pump')!;
    expect(hp.grossCostUSD).toBeNull();
    expect(hp.netCostUSD).toBeNull();
    expect(hp.paybackYears).toBeNull();
  });
});

describe('rebate gating', () => {
  it('tenure gate: a appliesToMultifamily:false rebate never matches a multifamily building', () => {
    const residentialRebate: RebateProgram = {
      name: 'Residential Heat Pump Rebate',
      administrator: 'Con Edison',
      measures: ['heat-pump'],
      appliesToMultifamily: false,
      incomeEligibleBonus: false,
      amount: '$8,000 per unit',
      amountNumericMaxUSD: 8000,
      status: 'active',
      sunsetDate: null,
      url: 'https://coned.com/residential',
    };
    const fixes = computeCandidateFixes(
      GOLDEN_FINES,
      GOLDEN_MEASURES,
      [...GOLDEN_REBATES, residentialRebate],
      '2030-2034',
      ctx,
    );
    for (const c of fixes) {
      expect(c.matchedRebates.map(r => r.name)).not.toContain(residentialRebate.name);
    }
  });

  it('income-restricted rebate is blocked for market-rate but unlocked (and lowers net cost) for affordable', () => {
    const affordableRebate: RebateProgram = {
      name: 'Con Edison AMEEP (affordable)',
      administrator: 'Con Edison',
      measures: ['heat-pump'],
      appliesToMultifamily: true,
      incomeEligibleBonus: true,
      incomeRestricted: true,
      amount: '$18,400 per unit (affordable)',
      amountNumericMaxUSD: 18400,
      status: 'active',
      sunsetDate: null,
      url: 'https://coned.com/ameep',
    };
    const rebates = [...GOLDEN_REBATES, affordableRebate];
    const market = computeCandidateFixes(GOLDEN_FINES, GOLDEN_MEASURES, rebates, '2030-2034', {
      ...ctx,
      affordable: false,
    });
    const affordable = computeCandidateFixes(GOLDEN_FINES, GOLDEN_MEASURES, rebates, '2030-2034', {
      ...ctx,
      affordable: true,
    });
    const hpMarket = market.find(c => c.measureKey === 'heat-pump')!;
    const hpAffordable = affordable.find(c => c.measureKey === 'heat-pump')!;

    expect(hpMarket.matchedRebates.map(r => r.name)).not.toContain(affordableRebate.name);
    expect(hpAffordable.matchedRebates.map(r => r.name)).toContain(affordableRebate.name);
    // best single rebate rises $5,000 -> $18,400 per unit, so net cost falls.
    expect(hpAffordable.netCostUSD!).toBeLessThan(hpMarket.netCostUSD!);
    expect(hpAffordable.netCostUSD).toBe((30000 - 18400) * 100);
  });

  it('uses the SINGLE best per-unit cash rebate, never the sum of stacked rebates', () => {
    const rebatesTwo: RebateProgram[] = [
      {
        name: 'Program A',
        administrator: 'NYSERDA',
        measures: ['heat-pump'],
        appliesToMultifamily: true,
        incomeEligibleBonus: false,
        amount: '$5,000 per unit',
        amountNumericMaxUSD: 5000,
        status: 'active',
        sunsetDate: null,
        url: 'https://example.com/a',
      },
      {
        name: 'Program B',
        administrator: 'Con Edison',
        measures: ['heat-pump'],
        appliesToMultifamily: true,
        incomeEligibleBonus: false,
        amount: '$3,000 per unit',
        amountNumericMaxUSD: 3000,
        status: 'active',
        sunsetDate: null,
        url: 'https://example.com/b',
      },
    ];
    const fixes = computeCandidateFixes(GOLDEN_FINES, GOLDEN_MEASURES, rebatesTwo, '2030-2034', ctx);
    const hp = fixes.find(c => c.measureKey === 'heat-pump')!;
    // best single = $5,000 => net = (30000 - 5000) × 100 = 2,500,000
    expect(hp.netCostUSD).toBe((30000 - 5000) * 100);
    // NOT the stacked (wrong) result of (30000 - 8000) × 100
    expect(hp.netCostUSD).not.toBe((30000 - 8000) * 100);
  });

  it('competitive grant (asOfRight:false) is surfaced as a chip but does not lower net cost', () => {
    const competitiveGrant: RebateProgram = {
      name: 'NYSERDA Through-Wall Heat Pump Demonstration',
      administrator: 'NYSERDA',
      measures: ['heat-pump'],
      appliesToMultifamily: true,
      incomeEligibleBonus: false,
      asOfRight: false,
      amount: 'up to $20,000 per apartment (competitive)',
      amountNumericMaxUSD: 20000,
      status: 'active',
      sunsetDate: null,
      url: 'https://nyserda.ny.gov/demo',
    };
    const fixes = computeCandidateFixes(
      GOLDEN_FINES,
      GOLDEN_MEASURES,
      [...GOLDEN_REBATES, competitiveGrant],
      '2030-2034',
      ctx,
    );
    const hp = fixes.find(c => c.measureKey === 'heat-pump')!;
    expect(hp.matchedRebates.map(r => r.name)).toContain(competitiveGrant.name);
    // net still uses the $5k as-of-right rebate, not the $20k grant.
    expect(hp.netCostUSD).toBe((30000 - 5000) * 100);
  });

  it('tax credit (cashEligible:false) is shown but excluded from net-cost math', () => {
    const taxCredit: RebateProgram = {
      name: 'Federal §179D Deduction',
      administrator: 'IRS',
      measures: ['heat-pump'],
      appliesToMultifamily: true,
      incomeEligibleBonus: false,
      cashEligible: false,
      amount: 'up to $5,000 per unit (tax deduction)',
      amountNumericMaxUSD: 5000,
      status: 'active',
      sunsetDate: null,
      url: 'https://irs.gov/179d',
    };
    // Only the tax credit available -> no cash rebate -> net == gross.
    const fixes = computeCandidateFixes(GOLDEN_FINES, GOLDEN_MEASURES, [taxCredit], '2030-2034', ctx);
    const hp = fixes.find(c => c.measureKey === 'heat-pump')!;
    expect(hp.matchedRebates.map(r => r.name)).toContain(taxCredit.name);
    expect(hp.netCostUSD).toBe(30000 * 100); // full gross
  });

  it('excludes expired programs from matched rebates', () => {
    const expired: RebateProgram = {
      name: 'Sunset Heat Pump Rebate',
      administrator: 'NYSERDA',
      measures: ['heat-pump'],
      appliesToMultifamily: true,
      incomeEligibleBonus: false,
      amount: '$10,000 per unit',
      amountNumericMaxUSD: 10000,
      status: 'expired',
      sunsetDate: '2024-12-31',
      url: 'https://example.com/expired',
    };
    const fixes = computeCandidateFixes(GOLDEN_FINES, GOLDEN_MEASURES, [expired], '2030-2034', ctx);
    const hp = fixes.find(c => c.measureKey === 'heat-pump')!;
    expect(hp.matchedRebates).toHaveLength(0);
    // no cash rebate -> net == gross
    expect(hp.netCostUSD).toBe(30000 * 100);
  });
});

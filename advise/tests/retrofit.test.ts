import { describe, it, expect } from 'vitest';
import { optimizeRetrofit, buildMacc, type OptimizeInput } from '../src/optimize/retrofit.ts';
import { GOLDEN_INPUT, GOLDEN_MEASURES, GOLDEN_REBATES, GOLDEN_EXPECTED } from './fixtures.ts';
import { MEASURES } from '../src/catalogs/measures.ts';
import { REBATES } from '../src/catalogs/rebates.ts';
import type { FineResult } from '../../engine/src/index.ts';

// ---------------------------------------------------------------------------
// MACC math (the per-measure marginal abatement cost curve, hand-checked).
// Full arithmetic is documented in lib/optimize/fixtures.ts under GOLDEN_EXPECTED.
// ---------------------------------------------------------------------------
describe('MACC', () => {
  it('computes per-measure $/tCO2e on the 1000 tCO2e base and sorts ascending', () => {
    const macc = buildMacc(1000, GOLDEN_MEASURES, GOLDEN_REBATES, {
      units: 100,
      isMultifamily: true,
      affordable: false,
      fuels: ['gas'],
    });
    // ascending by $/tCO2e: lighting (400) < controls (500) < heat-pump (5000)
    expect(macc.map(m => m.measureKey)).toEqual(GOLDEN_EXPECTED.maccSortedKeys);
    for (const p of macc) {
      expect(p.tCO2eReduced).toBeCloseTo(GOLDEN_EXPECTED.maccTonsReduced[p.measureKey], 6);
      expect(p.costPerTonUSD).toBeCloseTo(GOLDEN_EXPECTED.maccCostPerTon[p.measureKey], 6);
    }
  });
});

// ---------------------------------------------------------------------------
// Optimizer golden: the known-optimal subset {heat-pump, controls, lighting}
// with hand-checked capex / TCO / fines-avoided / residual.
// ---------------------------------------------------------------------------
describe('optimizeRetrofit (golden)', () => {
  const plan = optimizeRetrofit(GOLDEN_INPUT, GOLDEN_MEASURES, GOLDEN_REBATES);

  it('picks the min-TCO subset that meets the 2030-2034 limit', () => {
    expect([...plan.chosenMeasureKeys].sort()).toEqual([...GOLDEN_EXPECTED.chosenMeasureKeys].sort());
  });

  it('computes capex net of the single best cash rebate', () => {
    // gross 31,200/unit × 100 = 3,120,000 − heat-pump rebate 5,000×100 = 2,620,000
    expect(plan.capexUSD).toBe(GOLDEN_EXPECTED.capexUSD);
  });

  it('computes TCO = capex + residual fines to 2050', () => {
    expect(plan.tcoUSD).toBeCloseTo(GOLDEN_EXPECTED.tcoUSD, 2);
  });

  it('computes fines avoided vs do-nothing', () => {
    expect(plan.totalFinesAvoidedUSD).toBeCloseTo(GOLDEN_EXPECTED.totalFinesAvoidedUSD, 2);
  });

  it('reports residual emissions on the 2030-2034 basis', () => {
    expect(plan.residualEmissionsTco2e).toBeCloseTo(GOLDEN_EXPECTED.residualEmissionsTco2e, 6);
  });

  it('the chosen subset actually meets the 2030-2034 target limit', () => {
    const targetLimit = GOLDEN_INPUT.fines.find(f => f.period === '2030-2034')!.emissionsLimitTco2e;
    expect(plan.residualEmissionsTco2e).toBeLessThanOrEqual(targetLimit + 1e-9);
  });

  it('TCO is no worse than doing nothing', () => {
    expect(plan.tcoUSD).toBeLessThanOrEqual(GOLDEN_EXPECTED.doNothingTcoUSD);
  });

  it('emits a MACC sorted ascending by cost per ton', () => {
    expect(plan.macc.map(m => m.measureKey)).toEqual(GOLDEN_EXPECTED.maccSortedKeys);
    const cpts = plan.macc.map(m => m.costPerTonUSD ?? Infinity);
    for (let i = 1; i < cpts.length; i++) expect(cpts[i]).toBeGreaterThanOrEqual(cpts[i - 1]);
  });

  it('schedules chosen measures by MACC, all before the 2030 cliff', () => {
    const expectedOrder = GOLDEN_EXPECTED.maccSortedKeys.filter(k =>
      plan.chosenMeasureKeys.includes(k),
    );
    expect(plan.schedule.map(s => s.measureKey)).toEqual(expectedOrder);
    for (const s of plan.schedule) expect(s.doByYear).toBeLessThanOrEqual(2029);
  });

  it('reports an uncertainty range bracketing the point TCO', () => {
    expect(plan.range.tcoLowUSD).toBeLessThanOrEqual(plan.tcoUSD);
    expect(plan.range.tcoHighUSD).toBeGreaterThanOrEqual(plan.tcoUSD);
  });

  it('attaches matched rebates per chosen measure', () => {
    expect(plan.matchedRebatesByMeasure['heat-pump'].length).toBeGreaterThan(0);
    expect(plan.matchedRebatesByMeasure['heat-pump'][0].amountShort).toMatch(/\$5k\/unit/);
  });
});

// ---------------------------------------------------------------------------
// Already-compliant building: do-nothing meets the target, so choose nothing.
// ---------------------------------------------------------------------------
describe('optimizeRetrofit (already compliant)', () => {
  it('chooses the empty set when do-nothing is compliant through 2050', () => {
    // Genuinely compliant in EVERY period: actual ≤ the tightest limit (250),
    // so do-nothing has zero residual fines through 2050 and is unambiguously
    // min-TCO. (Setting actual to each period's own limit would still breach the
    // tighter 2035-2039 cap, leaving fines that further measures could cut —
    // which is the honest behaviour, just not "do nothing".)
    const fines = GOLDEN_INPUT.fines.map(f => ({
      ...f,
      actualEmissionsTco2e: 250,
      overageTco2e: Math.max(0, 250 - f.emissionsLimitTco2e),
      annualFineUsd: Math.max(0, 250 - f.emissionsLimitTco2e) * 268,
      compliant: 250 <= f.emissionsLimitTco2e,
    }));
    const plan = optimizeRetrofit({ ...GOLDEN_INPUT, fines }, GOLDEN_MEASURES, GOLDEN_REBATES);
    expect(plan.chosenMeasureKeys).toEqual([]);
    expect(plan.capexUSD).toBe(0);
    expect(plan.tcoUSD).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Production catalog smoke: the optimizer must run on the real 7-measure /
// real-rebate data and return a defensible plan (exact 2^7 = 128 enumeration).
// ---------------------------------------------------------------------------
describe('optimizeRetrofit (production catalog)', () => {
  // A gas-heated multifamily building well over its 2030 cap.
  const fines: FineResult[] = [
    { period: '2024-2029', emissionsLimitTco2e: 800, actualEmissionsTco2e: 1000, overageTco2e: 200, annualFineUsd: 53600, compliant: false, pathway: 'standard', notes: [] },
    { period: '2030-2034', emissionsLimitTco2e: 400, actualEmissionsTco2e: 1000, overageTco2e: 600, annualFineUsd: 160800, compliant: false, pathway: 'standard', notes: [] },
    { period: '2035-2039', emissionsLimitTco2e: 250, actualEmissionsTco2e: 1000, overageTco2e: 750, annualFineUsd: 201000, compliant: false, pathway: 'standard', notes: [] },
  ];
  const input: OptimizeInput = {
    fines,
    fuels: ['gas', 'electric'],
    units: 100,
    isMultifamily: true,
    affordable: false,
    targetPeriod: '2030-2034',
  };
  const plan = optimizeRetrofit(input, MEASURES, REBATES);

  it('returns a MACC for every fuel-applicable production measure, sorted ascending', () => {
    expect(plan.macc.length).toBeGreaterThan(0);
    const cpts = plan.macc.map(m => m.costPerTonUSD ?? Infinity);
    for (let i = 1; i < cpts.length; i++) expect(cpts[i]).toBeGreaterThanOrEqual(cpts[i - 1]);
  });

  it('picks a subset that meets the target limit (or the all-measures fallback)', () => {
    // Heat pump (38-65% mid ~51.5%) alone overshoots 400; an exact subset exists.
    expect(plan.residualEmissionsTco2e).toBeLessThanOrEqual(400 + 1e-9);
    expect(plan.chosenMeasureKeys.length).toBeGreaterThan(0);
  });

  it('schedules every chosen measure before the 2030 cliff', () => {
    expect(plan.schedule.map(s => s.measureKey).sort()).toEqual([...plan.chosenMeasureKeys].sort());
    for (const s of plan.schedule) expect(s.doByYear).toBeLessThanOrEqual(2029);
  });

  it('keeps TCO no worse than do-nothing and avoids a positive amount of fines', () => {
    // do-nothing fine portion = 53600×6 + 160800×5 + 201000×16 = 4,341,600
    const doNothing = 53600 * 6 + 160800 * 5 + 201000 * 16;
    expect(plan.tcoUSD).toBeLessThanOrEqual(doNothing);
    expect(plan.totalFinesAvoidedUSD).toBeGreaterThan(0);
  });
});

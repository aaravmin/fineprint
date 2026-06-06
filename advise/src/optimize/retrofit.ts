// FinePrint v2 — exact-optimal retrofit optimizer.
//
// The one rule: code computes EVERY number here; no LLM is involved. The
// optimizer enumerates all 2^N measure subsets (N = catalog measures that apply
// to the building's fuels; the production catalog has 7, so 128 subsets — exact,
// not heuristic), compounds emission reductions, prices each subset's net capex
// (single best per-unit cash rebate per measure, scaled by units) and its
// residual statutory fines through the 2050 modeling horizon, and returns the
// minimum-TCO subset that meets the target-period emissions limit.
//
// Companion outputs: a marginal-abatement-cost curve (MACC, $/tCO2e per measure,
// sorted ascending), a pre-2030-cliff schedule, and a Low/High uncertainty range
// re-run at each measure's reduction bounds.
//
// Numbers are derived only from: the FineResult limits/actuals produced by the
// deterministic engine, the verified catalog cost / reduction figures, and the
// statutory $268/tCO2e penalty. Field names follow the LOCKED INTERFACE CONTRACT.

import type { FineResult, Period } from '../../../engine/src/index.ts';
import type { Measure, RebateProgram, MatchedRebate } from '../catalogs/types.ts';

// The engine exposes computeAllPeriods but no PERIODS constant, so the canonical
// period list is defined here. It mirrors the engine's Period union exactly.
const PERIODS: Period[] = ['2024-2029', '2030-2034', '2035-2039'];

export interface MaccPoint {
  measureKey: string;
  name: string;
  tCO2eReduced: number;
  netCostUSD: number | null;
  costPerTonUSD: number | null;
}

export interface ScheduledMeasure {
  measureKey: string;
  name: string;
  doByYear: number;
}

export interface RetrofitPlan {
  chosenMeasureKeys: string[];
  capexUSD: number;
  totalFinesAvoidedUSD: number; // through 2050, vs do-nothing
  tcoUSD: number; // capex + residual fines-to-2050 (+ energy term, 0 for now)
  residualEmissionsTco2e: number; // 2030-2034 basis
  macc: MaccPoint[]; // sorted ascending by costPerTonUSD
  schedule: ScheduledMeasure[];
  range: { tcoLowUSD: number; tcoHighUSD: number };
  matchedRebatesByMeasure: Record<string, MatchedRebate[]>;
}

export interface OptimizeInput {
  fines: FineResult[]; // computeAllPeriods output
  fuels: string[]; // 'gas' | 'oil' | 'steam' | 'electric'
  units: number | null; // dwelling-unit count — scales per-unit rebates
  grossFloorAreaSqft?: number | null; // primary cost basis ($/sqft); works for every building type
  isMultifamily: boolean;
  affordable: boolean;
  targetPeriod?: Period; // default '2030-2034'
}

// Statutory penalty: $268 per tCO2e over the cap (1 RCNY §103-14(h)).
const PENALTY_USD_PER_TON = 268;
// Modeling horizon: the final defined period's limit is carried forward to 2050.
const HORIZON_YEAR = 2050;

// Year span each period covers within the 2024..2050 modeling horizon.
const PERIOD_START: Record<Period, number> = {
  '2024-2029': 2024,
  '2030-2034': 2030,
  '2035-2039': 2035,
};
const PERIOD_END: Record<Period, number> = {
  '2024-2029': 2029,
  '2030-2034': 2034,
  '2035-2039': HORIZON_YEAR, // final period carries forward to the horizon
};
function periodYears(p: Period): number {
  return PERIOD_END[p] - PERIOD_START[p] + 1;
}

// Pluggable energy term — 0 until a verified $/measure energy-cost delta exists.
// Present in the objective and testable, but contributes nothing, so every TCO
// number stays defensible (inventing a $/kWh-displaced figure would cross the
// honesty line). Wire a real figure in here later, keyed by measure.
function energyDeltaUSD(_measureKey: string): number {
  return 0;
}

function measureApplies(m: Measure, fuels: string[]): boolean {
  return m.appliesToFuel.includes('any') || m.appliesToFuel.some(f => fuels.includes(f));
}

// Rebate gating mirrors lib/advise/roi.ts exactly (explicit data flags, not prose
// regex). Income-restricted programs only unlock for affordable/rent-regulated
// buildings; cash rebates for net-cost math are positive, as-of-right, and not a
// tax deduction/credit.
const isAffordableOnly = (r: RebateProgram) => r.incomeRestricted === true;
const isCash = (r: RebateProgram) =>
  (r.amountNumericMaxUSD ?? 0) > 0 && r.cashEligible !== false && r.asOfRight !== false;

function compactRebateAmount(r: RebateProgram): string {
  const n = r.amountNumericMaxUSD;
  if (n == null) return /free|advisor/i.test(`${r.name} ${r.amount}`) ? 'free' : 'varies';
  const d = n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
  return `up to ${d}/unit`;
}

// Programs applicable to THIS building + measure. Excludes expired programs,
// wrong tenure, and income-restricted programs when the building is market-rate.
function matchRebates(
  m: Measure,
  rebates: RebateProgram[],
  ctx: { isMultifamily: boolean; affordable: boolean },
): RebateProgram[] {
  return rebates.filter(
    r =>
      r.status !== 'expired' &&
      r.measures.includes(m.key) &&
      r.appliesToMultifamily === ctx.isMultifamily &&
      (ctx.affordable || !isAffordableOnly(r)),
  );
}

interface Ctx {
  units: number | null;
  gfa?: number | null;
  isMultifamily: boolean;
  affordable: boolean;
  fuels: string[];
}

/**
 * Gross (pre-rebate) capital for a measure. Primary basis is $/sqft × GFA, which
 * works for EVERY building type (commercial, government, residential). Falls back
 * to the legacy per-dwelling-unit figure only when GFA is unavailable. Returns
 * null only when neither basis can be computed.
 */
function grossCapex(m: Measure, ctx: Ctx): number | null {
  if (m.typicalCostPerSqftUSD != null && ctx.gfa != null && ctx.gfa > 0) {
    return m.typicalCostPerSqftUSD * ctx.gfa;
  }
  if (m.typicalCostPerUnitUSDMax != null && ctx.units != null) {
    return m.typicalCostPerUnitUSDMax * ctx.units;
  }
  return null;
}

/**
 * Net capex for a single measure: gross − bestPerUnitCashRebate×units (floored at
 * 0). Per-unit cash rebates only apply when a dwelling-unit count exists (they are
 * multifamily programs); commercial buildings simply carry full gross cost.
 * Returns null only if the measure is genuinely uncostable (no $/sqft and no
 * per-unit figure with units).
 */
function netCapex(m: Measure, rebates: RebateProgram[], ctx: Ctx): number | null {
  const gross = grossCapex(m, ctx);
  if (gross == null) return null;
  const matched = matchRebates(m, rebates, ctx).filter(isCash);
  const bestPerUnit = matched.reduce((mx, r) => Math.max(mx, r.amountNumericMaxUSD ?? 0), 0);
  const rebateTotal = ctx.units != null ? bestPerUnit * ctx.units : 0;
  return Math.max(0, gross - rebateTotal);
}

/** Reduction fraction used for the point estimate (mid) / Low / High bounds. */
type RedMode = 'mid' | 'low' | 'high';
function reductionPct(m: Measure, mode: RedMode): number {
  if (mode === 'low') return m.emissionsReductionPctLow / 100;
  if (mode === 'high') return m.emissionsReductionPctHigh / 100;
  return (m.emissionsReductionPctLow + m.emissionsReductionPctHigh) / 200;
}

/**
 * Per-measure marginal abatement cost on a fixed base, sorted ascending by
 * $/tCO2e. Standalone (each measure scored against the full base), so the curve
 * shows which measures are cheapest per ton independent of selection order.
 */
export function buildMacc(
  baseEmissions: number,
  measures: Measure[],
  rebates: RebateProgram[],
  ctx: Ctx,
): MaccPoint[] {
  const points = measures
    .filter(m => measureApplies(m, ctx.fuels))
    .map(m => {
      const tons = baseEmissions * reductionPct(m, 'mid');
      const net = netCapex(m, rebates, ctx);
      const cpt = net != null && tons > 0 ? net / tons : null;
      return { measureKey: m.key, name: m.name, tCO2eReduced: tons, netCostUSD: net, costPerTonUSD: cpt };
    });
  // Ascending by $/tCO2e; uncostable measures (null) sink to the end.
  return points.sort((a, b) => (a.costPerTonUSD ?? Infinity) - (b.costPerTonUSD ?? Infinity));
}

/** Residual emissions after compounding a subset's reductions (order-independent). */
function residualEmissions(base: number, subset: Measure[], mode: RedMode): number {
  return subset.reduce((e, m) => e * (1 - reductionPct(m, mode)), base);
}

/**
 * Σ residual annual fines from 2024..2050, given residual emissions re-fined
 * against each period's limit (overage = max(0, residual − limit), each period's
 * annual fine multiplied by the number of years that period covers).
 */
function residualFinesToHorizon(residual: number, fines: FineResult[]): number {
  let total = 0;
  for (const f of fines) {
    const overage = Math.max(0, residual - f.emissionsLimitTco2e);
    total += overage * PENALTY_USD_PER_TON * periodYears(f.period);
  }
  return total;
}

function subsetCapex(subset: Measure[], rebates: RebateProgram[], ctx: Ctx): number {
  return subset.reduce((sum, m) => sum + (netCapex(m, rebates, ctx) ?? 0), 0);
}
function subsetEnergy(subset: Measure[]): number {
  return subset.reduce((sum, m) => sum + energyDeltaUSD(m.key), 0);
}

/** TCO objective for a subset: net capex + residual fines-to-2050 + energy term. */
function tcoForSubset(
  base: number,
  subset: Measure[],
  fines: FineResult[],
  rebates: RebateProgram[],
  ctx: Ctx,
  mode: RedMode,
): number {
  const residual = residualEmissions(base, subset, mode);
  return subsetCapex(subset, rebates, ctx) + residualFinesToHorizon(residual, fines) + subsetEnergy(subset);
}

/**
 * Enumerate all 2^N subsets; return the min-TCO subset whose residual emissions
 * meet the target-period limit (point/mid estimate). N is small (≤7 in the
 * production catalog), so the exhaustive search is exact and cheap.
 */
function bestSubset(
  base: number,
  eligible: Measure[],
  fines: FineResult[],
  rebates: RebateProgram[],
  ctx: Ctx,
  targetLimit: number,
  mode: RedMode,
): { subset: Measure[]; tco: number } {
  const n = eligible.length;
  let best: { subset: Measure[]; tco: number } | null = null;
  for (let mask = 0; mask < 1 << n; mask++) {
    const subset = eligible.filter((_, i) => (mask & (1 << i)) !== 0);
    const residual = residualEmissions(base, subset, mode);
    if (residual > targetLimit + 1e-9) continue; // must meet the target-period limit
    const tco = tcoForSubset(base, subset, fines, rebates, ctx, mode);
    if (best == null || tco < best.tco) best = { subset, tco };
  }
  // If nothing meets the limit (physically impossible target), fall back to the
  // all-measures subset — the most aggressive plan available.
  if (best == null) {
    const subset = eligible;
    best = { subset, tco: tcoForSubset(base, subset, fines, rebates, ctx, mode) };
  }
  return best;
}

export function optimizeRetrofit(
  input: OptimizeInput,
  measures: Measure[],
  rebates: RebateProgram[],
): RetrofitPlan {
  const targetPeriod: Period = input.targetPeriod ?? '2030-2034';
  const ctx: Ctx = {
    units: input.units,
    gfa: input.grossFloorAreaSqft ?? null,
    isMultifamily: input.isMultifamily,
    affordable: input.affordable,
    fuels: input.fuels,
  };
  const byPeriod = new Map<Period, FineResult>(input.fines.map(f => [f.period, f]));
  const targetFine = byPeriod.get(targetPeriod);
  const base = targetFine?.actualEmissionsTco2e ?? input.fines[0]?.actualEmissionsTco2e ?? 0;
  const targetLimit = targetFine?.emissionsLimitTco2e ?? base;
  const eligible = measures.filter(m => measureApplies(m, ctx.fuels));

  const macc = buildMacc(base, measures, rebates, ctx);

  const { subset: chosen, tco } = bestSubset(
    base,
    eligible,
    input.fines,
    rebates,
    ctx,
    targetLimit,
    'mid',
  );
  const chosenKeys = new Set(chosen.map(m => m.key));

  const capexUSD = subsetCapex(chosen, rebates, ctx);
  // residual is order- and period-independent (a compounded fraction of base),
  // so the chosen subset's residual is the 2030-2034 basis figure.
  const residual2030 = residualEmissions(base, chosen, 'mid');
  // Fines avoided through 2050 vs the do-nothing baseline (point estimate).
  const doNothingFines = residualFinesToHorizon(base, input.fines);
  const chosenFines = residualFinesToHorizon(residual2030, input.fines);
  const totalFinesAvoidedUSD = doNothingFines - chosenFines;

  // Schedule: chosen measures ordered by MACC ascending, all placed before the
  // 2030 cliff (2027, 2028, 2029 — capped at 2029).
  const schedule: ScheduledMeasure[] = macc
    .filter(p => chosenKeys.has(p.measureKey))
    .map((p, i) => ({
      measureKey: p.measureKey,
      name: p.name,
      doByYear: Math.min(2027 + i, 2029),
    }));

  // Uncertainty: hold the chosen subset, recompute TCO at the Low and High
  // reduction bounds. Less reduction → higher residual fines → higher TCO, and
  // vice versa; we take min/max so tcoLowUSD ≤ point ≤ tcoHighUSD always holds.
  const tcoLow = tcoForSubset(base, chosen, input.fines, rebates, ctx, 'low');
  const tcoHigh = tcoForSubset(base, chosen, input.fines, rebates, ctx, 'high');
  const range = {
    tcoLowUSD: Math.min(tco, tcoLow, tcoHigh),
    tcoHighUSD: Math.max(tco, tcoLow, tcoHigh),
  };

  const matchedRebatesByMeasure: Record<string, MatchedRebate[]> = {};
  for (const m of chosen) {
    matchedRebatesByMeasure[m.key] = matchRebates(m, rebates, ctx).map(r => ({
      name: r.name,
      amount: r.amount,
      amountShort: compactRebateAmount(r),
      url: r.url,
    }));
  }

  return {
    chosenMeasureKeys: chosen.map(m => m.key),
    capexUSD,
    totalFinesAvoidedUSD,
    tcoUSD: tco,
    residualEmissionsTco2e: residual2030,
    macc,
    schedule,
    range,
    matchedRebatesByMeasure,
  };
}

// Export PERIODS so consumers can iterate the canonical period list.
export { PERIODS };

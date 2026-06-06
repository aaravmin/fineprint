// FinePrint — retrofit ROI / fix-candidate module.
//
// The one rule: code computes every number; Claude only ranks/explains. This file
// is the "code" side — it emits a FixCandidate[] in which every dollar, ton, and
// year is deterministically computed from the engine's FineResult[] plus the
// verified measure/rebate catalogs. The AI drafting layer later reorders the
// array and fills `rationale`; it never alters a number here.
//
// Input is the engine's FineResult[] for the target plan period plus a small
// RoiContext (fuels / units / tenure / affordability), keeping this module
// independent of any building-assessment object.

import type { FineResult, Period } from '../../engine/src/index.ts';
import type { Measure, RebateProgram, MatchedRebate } from './catalogs/types.ts';

// $268 per metric ton CO2e per year over the cap (Admin Code §28-320.6 / 1 RCNY
// §103-14(h)). Kept as a local constant so this module stays decoupled from the
// engine's internal cents representation (the engine stores cents; this works in
// whole USD per ton — the two never mix here).
const PENALTY_USD_PER_TON = 268;

/**
 * FixCandidate — the locked contract shape. Every numeric field is code-computed
 * here; `rationale` is filled by the AI drafting layer downstream.
 */
export interface FixCandidate {
  measureKey: string;
  measure: string;
  tCO2eReduced: number;
  grossCostUSD: number | null;
  matchedRebates: MatchedRebate[];
  netCostUSD: number | null;
  paybackYears: number | null;
  fineAvoidedUSD: number;
  rationale?: string;
}

/**
 * Building inputs the ROI math needs, decoupled from any assessment type.
 * - `units`: dwelling-unit count for cost scaling; null when GFA can't yield a
 *   defensible count (the data layer nulls unit-scaled costs rather than inventing one).
 * - `isMultifamily`: tenure gate — a rebate's `appliesToMultifamily` must match exactly.
 * - `affordable`: unlocks income-restricted (rent-regulated/affordable-only) programs.
 * - `fuels`: building fuels ('gas'|'oil'|'steam'|'electric'); a measure applies if it
 *   targets 'any' or any of these.
 */
export interface RoiContext {
  units: number | null;
  gfa?: number | null; // primary cost basis ($/sqft); works for every building type
  isMultifamily: boolean;
  affordable: boolean;
  fuels: string[];
}

function applies(m: Measure, fuels: string[]): boolean {
  return m.appliesToFuel.includes('any') || m.appliesToFuel.some(f => fuels.includes(f));
}

// Income-restricted programs are only valid for affordable/rent-regulated buildings.
// Gated on an explicit data flag, not a prose regex (RebateProgram.incomeRestricted).
const isAffordableOnly = (r: RebateProgram) => r.incomeRestricted === true;

// Cash rebates for net-cost math: a positive as-of-right cash amount. Excludes tax
// deductions/credits (cashEligible:false) and competitive/demonstration grants
// (asOfRight:false) — those are surfaced informationally but never lower net cost.
const isCash = (r: RebateProgram) =>
  (r.amountNumericMaxUSD ?? 0) > 0 && r.cashEligible !== false && r.asOfRight !== false;

function compactRebateAmount(r: RebateProgram): string {
  const n = r.amountNumericMaxUSD;
  if (n == null) return /free|advisor/i.test(`${r.name} ${r.amount}`) ? 'free' : 'varies';
  const d = n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
  return `up to ${d}/unit`;
}

/**
 * Build ranked retrofit candidates from the engine's FineResult[] for the given plan period.
 * Every number is code-computed.
 *
 * - tCO2eReduced = mid-point of the measure's reduction range × the period's actual emissions.
 * - fineAvoidedUSD is bounded by the period overage (NOT the raw fine): a measure can only
 *   avoid the fine on the excess it actually removes, so each figure is an honest standalone
 *   number — they are not additive across measures.
 * - Net cost uses a SINGLE best per-unit cash rebate (programs are largely mutually exclusive),
 *   scaled by the same unit count as gross cost. Affordable buildings unlock income-restricted
 *   programs; wrong-tenure and (when market-rate) income-restricted programs are excluded.
 * - Sorted by payback ascending (nulls last), then by fine avoided descending.
 */
export function computeCandidateFixes(
  fines: FineResult[],
  measures: Measure[],
  rebates: RebateProgram[],
  planPeriod: Period,
  ctx: RoiContext,
): FixCandidate[] {
  const period = fines.find(f => f.period === planPeriod) ?? fines[0];
  const emissions = period?.actualEmissionsTco2e ?? 0;
  const overage = period?.overageTco2e ?? 0;
  const units = ctx.units;

  const candidates: FixCandidate[] = measures
    .filter(m => applies(m, ctx.fuels))
    .map(m => {
      const midPct = (m.emissionsReductionPctLow + m.emissionsReductionPctHigh) / 2;
      const tCO2eReduced = emissions * (midPct / 100);
      const fineAvoidedUSD = Math.min(tCO2eReduced, overage) * PENALTY_USD_PER_TON;

      // Programs applicable to THIS building + measure. Exclude expired programs,
      // wrong tenure, and income-restricted-when-market-rate.
      const matched = rebates.filter(
        r =>
          r.status !== 'expired' &&
          r.measures.includes(m.key) &&
          r.appliesToMultifamily === ctx.isMultifamily &&
          (ctx.affordable || !isAffordableOnly(r)),
      );
      const matchedRebates: MatchedRebate[] = matched.map(r => ({
        name: r.name,
        amount: r.amount,
        amountShort: compactRebateAmount(r),
        url: r.url,
      }));

      // Single best per-unit cash rebate (NOT a sum), scaled by units to match
      // gross cost's unit scale.
      const bestPerUnitRebate = matched
        .filter(isCash)
        .reduce((mx, r) => Math.max(mx, r.amountNumericMaxUSD ?? 0), 0);
      // Cost basis: $/sqft × GFA (works for every building type); fall back to
      // the legacy per-dwelling-unit figure only when GFA is unavailable.
      const grossCostUSD =
        m.typicalCostPerSqftUSD != null && ctx.gfa != null && ctx.gfa > 0
          ? m.typicalCostPerSqftUSD * ctx.gfa
          : units != null && m.typicalCostPerUnitUSDMax != null
            ? m.typicalCostPerUnitUSDMax * units
            : null;
      const rebateValueUSD = units != null ? bestPerUnitRebate * units : 0;
      const netCostUSD = grossCostUSD != null ? Math.max(0, grossCostUSD - rebateValueUSD) : null;
      const paybackYears =
        netCostUSD != null && fineAvoidedUSD > 0 ? netCostUSD / fineAvoidedUSD : null;

      return {
        measureKey: m.key,
        measure: m.name,
        tCO2eReduced,
        grossCostUSD,
        matchedRebates,
        netCostUSD,
        paybackYears,
        fineAvoidedUSD,
      };
    });

  return candidates.sort((x, y) => {
    const px = x.paybackYears ?? Infinity;
    const py = y.paybackYears ?? Infinity;
    if (px !== py) return px - py;
    return y.fineAvoidedUSD - x.fineAvoidedUSD;
  });
}

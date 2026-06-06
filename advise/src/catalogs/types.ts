// Catalogs — locked interface contract (carried from FinePrint v2).
// These three interfaces are frozen: do not rename fields. Measure /
// RebateProgram / MatchedRebate are implemented field-for-field by
// measures.ts and rebates.ts, and consumed by the ROI + optimizer modules.

export interface Measure {
  key: string; // 'heat-pump' | 'heat-pump-water-heater' | 'lighting' | 'envelope' | 'controls' | 'solar-pv' | 'weatherization'
  name: string;
  appliesToFuel: string[]; // 'gas' | 'oil' | 'steam' | 'electric' | 'any'
  emissionsReductionPctLow: number;
  emissionsReductionPctHigh: number;
  typicalCostPerUnitUSDMax: number | null; // rough $ per dwelling unit (multifamily rebate scale)
  typicalCostPerSqftUSD?: number | null; // rough installed $ per gross sqft — the primary, building-type-agnostic cost basis (works for commercial + residential)
  typicalCostNote: string;
  url: string;
}

export interface RebateProgram {
  name: string;
  administrator: string;
  measures: string[]; // measure keys it funds
  appliesToMultifamily: boolean;
  incomeEligibleBonus: boolean;
  amount: string; // human-readable
  amountNumericMaxUSD: number | null;
  status: string; // 'active' | 'expiring' | 'expired'
  sunsetDate: string | null;
  url: string;
  // Explicit eligibility flags (replace brittle prose-regex gating in roi.ts).
  // Defaults when omitted: cashEligible=true, asOfRight=true, incomeRestricted=false.
  incomeRestricted?: boolean; // true => only valid for affordable/rent-regulated buildings
  cashEligible?: boolean; // false => a tax deduction/credit or advisory; never drives net-cost math
  asOfRight?: boolean; // false => competitive/demonstration grant, not an entitlement; informational only
}

export interface MatchedRebate {
  name: string;
  amount: string;
  amountShort: string;
  url: string;
}

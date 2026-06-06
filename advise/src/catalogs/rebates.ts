import type { RebateProgram } from './types.ts';

// Verified 2026 incentive catalog (asOf 2026-06). Sourced via research workflow against
// Con Edison / NYSERDA / IRS / NYC HPD primary sources. Figures are program-year specific —
// re-verify before relying.
//
// ⚠️ RE-VERIFY IRA §179D and §45L FIGURES BEFORE RELYING: the One Big Beautiful Bill (OBBB,
//    Public Law 119-21, signed 2025-07-04) shifted these in 2025 — §179D construction must now
//    begin on/before 2026-06-30 and §45L is being sunset. Confirm current dollar amounts,
//    prevailing-wage/apprenticeship multipliers, and begin-construction/sunset deadlines against
//    the IRS OBBB FAQ before using any of these numbers in client-facing math.
export const REBATES: RebateProgram[] = [
  {
    name: 'Con Edison Multifamily Energy Efficiency Program — Building Electrification (MFEEP-E, market-rate 5+ unit)',
    administrator: 'Con Edison (NYS Clean Heat statewide framework; NYSERDA / NY PSC oversight)',
    measures: ['heat-pump', 'heat-pump-water-heater'],
    appliesToMultifamily: true,
    incomeEligibleBonus: true,
    amount:
      'Prescriptive full-building-load space-heating electrification (ASHP): $5,000 per dwelling unit. Prescriptive domestic hot water (HPWH): $1,000 per dwelling unit. Custom space heating or DHW: $200/MMBtu (full load); phased-load electrification $70/MMBtu. Capped at $1,000,000 per project OR 50% of project costs, whichever is less.',
    amountNumericMaxUSD: 5000,
    status: 'active',
    sunsetDate: '2026-11-01',
    url: 'https://www.coned.com/en/save-money/rebates-incentives-tax-credits/rebates-incentives-for-multifamily-customers/electric-heating-and-cooling-technology-for-multifamily-buildings/heat-pump-incentives',
  },
  {
    name: 'Con Edison Affordable Multifamily Energy Efficiency Program — Building Electrification (AMEEP-E, income-eligible 5+ unit)',
    administrator: 'Con Edison / NYS Affordable Multifamily Energy Efficiency Program (NYSERDA / NY PSC oversight)',
    measures: ['heat-pump', 'heat-pump-water-heater', 'envelope', 'weatherization'],
    appliesToMultifamily: true,
    incomeEligibleBonus: true,
    amount:
      'Per dwelling unit — Space heating (ASHP): $12,000 (non-comprehensive) / $14,000 (comprehensive). Water heating (HPWH): $2,400 / $4,400. Space + water combined: $14,400 / $18,400. Required attic insulation at $5/sq ft. Plus an additional $2,000/unit enhanced comprehensive adder on top of standard non-comprehensive amounts. Capped at $1,000,000 per project OR 85% of project costs, whichever is lower.',
    amountNumericMaxUSD: 18400,
    incomeRestricted: true,
    status: 'active',
    sunsetDate: '2026-11-01',
    url: 'https://www.coned.com/en/save-money/rebates-incentives-tax-credits/rebates-incentives-for-multifamily-customers/electric-heating-and-cooling-technology-for-multifamily-buildings/heat-pump-incentives',
  },
  {
    name: 'Con Edison Affordable Multifamily Energy Efficiency Program — Comprehensive Efficiency Pathway (AMEEP, points-based)',
    administrator: 'Con Edison / NYSERDA (NYS Affordable Multifamily Energy Efficiency Program)',
    measures: ['heat-pump', 'heat-pump-water-heater', 'envelope', 'weatherization', 'controls', 'lighting'],
    appliesToMultifamily: true,
    incomeEligibleBonus: true,
    amount:
      'Points-based per-dwelling-unit incentive: Tier A (80-99 pts) up to $1,200/unit ($750 base + $250 Con Ed adder + up to $200 small-building 5-25 unit adder); Tier B (100-129 pts) up to $2,000/unit; Tier C (130+ pts) up to $2,600/unit ($2,000 + $200 + $400). Capped at 85% of project cost. Itemized measure rates (NYSERDA AMEEP fact sheet): lighting LED $5-$8/lamp, fixtures $45-$150, exit signs $8, occupancy sensors $10/sensor; attic insulation $5/sq ft; etc.',
    amountNumericMaxUSD: 2600,
    incomeRestricted: true,
    status: 'active',
    sunsetDate: null,
    url: 'https://www.coned.com/en/save-money/rebates-incentives-tax-credits/rebates-incentives-for-multifamily-customers/affordable-buildings',
  },
  {
    name: 'Con Edison Multifamily Energy Efficiency Program — Weatherization & Envelope (MFEEP market-rate / AMEEP affordable)',
    administrator: 'Con Edison (Multifamily Energy Efficiency Program / AMEEP)',
    measures: ['weatherization', 'envelope'],
    appliesToMultifamily: true,
    incomeEligibleBonus: true,
    amount:
      'Attic cavity insulation $5/sq ft; above-deck roof insulation $8/sq ft (spray foam) or $10/sq ft (rigid/VIP); wall cavity insulation $240/MMBtu; window replacement $240/MMBtu; air sealing $3/therm (market-rate) or $5/therm (affordable); building envelope on steam/oil $40/MMBtu. Market-rate capped at 70% of project cost; affordable (AMEEP) capped at 85%.',
    amountNumericMaxUSD: null,
    status: 'active',
    sunsetDate: '2026-11-01',
    url: 'https://www.coned.com/-/media/files/coned/documents/save-energy-money/rebates-incentives-tax-credits/rebates-incentives-for-multifamily-customers/program-incentives.pdf',
  },
  {
    name: 'Con Edison Multifamily Energy Efficiency Program — Controls & Electric Efficiency (BMS/EMS, thermostats, VFDs, EC motors)',
    administrator: 'Con Edison (Multifamily Energy Efficiency Program / AMEEP)',
    measures: ['controls'],
    appliesToMultifamily: true,
    incomeEligibleBonus: true,
    amount:
      'Advanced thermostats $0.16/kWh (market) / $0.18/kWh (affordable); prescriptive VFDs $0.19-$0.29/kWh; custom VFDs, booster-pump VFDs, EC motors, rooftop exhaust-fan motors $0.35/kWh (market) / $0.50/kWh (affordable); elevator modernization $0.25-$0.35/kWh; building automation system controls (secondary steam/oil savings) $40/MMBtu; boiler advanced controls (EMS) $1,500-$9,000 by unit count. Market-rate capped at 70% of project cost; affordable capped at 85%.',
    amountNumericMaxUSD: null,
    status: 'active',
    sunsetDate: '2026-11-01',
    url: 'https://www.coned.com/-/media/files/coned/documents/save-energy-money/rebates-incentives-tax-credits/rebates-incentives-for-multifamily-customers/program-incentives.pdf',
  },
  {
    name: 'NYS Clean Heat — Con Edison Residential Air-Source Heat Pump (1-4 unit / condo-co-op individual install)',
    administrator: 'Con Edison (utility delivery of statewide NYS Clean Heat; NYSERDA / NY PSC oversight)',
    measures: ['heat-pump', 'controls'],
    appliesToMultifamily: false,
    incomeEligibleBonus: false,
    amount:
      'Option 1 (full replacement, fossil system removed/disabled), ccASHP full-load: $8,000 per single-family / $4,000 per apartment in a 1-4 unit building ($10,000 / $5,000 in a Disadvantaged Community). Option 2 (partial, fossil kept as backup + integrated controls): $2,500 / $1,000 ($4,500 / $2,000 in a DAC). Partial-to-full upgrade: $4,000 / $1,500. Capped at 70% of project cost (85% in a DAC).',
    amountNumericMaxUSD: 10000,
    status: 'active',
    sunsetDate: null,
    url: 'https://www.coned.com/en/save-money/rebates-incentives-tax-credits/rebates-incentives-tax-credits-for-residential-customers/electric-heating-and-cooling-technology-for-renters-homeowners/save-on-a-central-air-source-heat-pump',
  },
  {
    name: 'NYS Clean Heat — Con Edison Residential Ground-Source / Geothermal Heat Pump (whole-building, 1-4 unit)',
    administrator: 'Con Edison (NYS Clean Heat geothermal track; NYSERDA / NY PSC oversight)',
    measures: ['heat-pump'],
    appliesToMultifamily: false,
    incomeEligibleBonus: true,
    amount:
      'GSHP full-load whole-building (all units in a 1-4 unit building): up to $30,000 (or 70% of project cost, whichever lower); up to $40,000 in a Disadvantaged Community (or 85% of project cost). Other utilities use different per-unit GSHP tables.',
    amountNumericMaxUSD: 40000,
    status: 'active',
    sunsetDate: null,
    url: 'https://www.coned.com/en/save-money/rebates-incentives-tax-credits/rebates-incentives-tax-credits-for-residential-customers/electric-heating-and-cooling-technology-for-renters-homeowners/save-thousands-on-a-geothermal-system',
  },
  {
    name: 'NYS Clean Heat — Con Edison Residential Heat Pump Water Heater (HPWH, 1-4 unit, midstream)',
    administrator: 'Con Edison (NYS Clean Heat, midstream Category 5a; NYSERDA / NY PSC oversight)',
    measures: ['heat-pump-water-heater'],
    appliesToMultifamily: false,
    incomeEligibleBonus: false,
    amount:
      '$1,000 per HPWH unit in Con Edison territory (midstream/retail pass-through). Other utilities (Central Hudson, National Grid, NYSEG, RG&E) pay $1,250 per unit. GSHP desuperheater (Category 5b) is a separate $100/unit.',
    amountNumericMaxUSD: 1250,
    status: 'active',
    sunsetDate: null,
    url: 'https://cleanheat.ny.gov/assets/pdf/NYS%20Clean%20Heat%20Program%20Manual%202025.12.12.pdf',
  },
  {
    name: 'NYSERDA EmPower+ / New York Home Energy Rebates (HEAR — Home Electrification & Appliance Rebates, IRA-funded)',
    administrator: 'NYSERDA (state-administered) with US DOE IRA HEAR funding',
    measures: ['heat-pump', 'heat-pump-water-heater', 'weatherization', 'envelope', 'controls'],
    appliesToMultifamily: true,
    incomeEligibleBonus: true,
    amount:
      'Income-eligible households: heat pumps up to $8,000; heat pump water heaters up to $1,750; insulation/air sealing/ventilation up to $1,600; electrical panel/service upgrade up to $4,000; wiring up to $2,500 — total HEAR cap $14,000 per household. Stackable with state EmPower+ to roughly $24,000 per qualifying household; ≤80% AMI up to 100% of cost, 80-150% AMI up to 50%. HOMES whole-building rebates scale up to ~$400,000 for large multifamily projects.',
    amountNumericMaxUSD: 14000,
    incomeRestricted: true,
    status: 'active',
    sunsetDate: null,
    url: 'https://www.nyserda.ny.gov/All-Programs/Inflation-Reduction-Act/Inflation-Reduction-Act-homeowners',
  },
  {
    name: 'Federal — Clean Electricity Investment Credit (IRC §48E) ITC (multifamily common systems: solar PV + battery storage)',
    administrator: 'IRS / U.S. Department of the Treasury',
    measures: ['solar-pv'],
    appliesToMultifamily: true,
    incomeEligibleBonus: true,
    amount:
      'Base 6% of eligible project cost; 30% if prevailing-wage & apprenticeship (PWA) requirements are met; plus bonus adders (low-income/affordable-housing allocation, energy community, domestic content) stacking to roughly 40-50%. Post-OBBB solar PV must begin construction by 2026-07-04 (placed in service by 2027-12-31). NOTE: ground-source/geothermal heat pumps and storage also qualify for §48E but on a separate, longer schedule (begin construction by ~Jan 2035); ordinary air-source heat pumps do NOT qualify — which is why this credit is scoped to solar PV here.',
    amountNumericMaxUSD: null,
    cashEligible: false,
    status: 'expiring',
    sunsetDate: '2027-12-31',
    url: 'https://www.irs.gov/newsroom/faqs-for-modification-of-sections-25c-25d-25e-30c-30d-45l-45w-and-179d-under-public-law-119-21-139-stat-72-july-4-2025-commonly-known-as-the-one-big-beautiful-bill-obbb',
  },
  {
    // ⚠️ RE-VERIFY §179D: OBBB (2025) requires construction to begin on/before 2026-06-30 and
    //    changed the per-sq-ft schedule + inflation adjustment. Confirm dollar amounts and the
    //    sunset deadline against the IRS OBBB FAQ before relying on these figures.
    name: 'Federal — Energy Efficient Commercial Buildings Deduction (IRC §179D)',
    administrator: 'IRS (federal tax deduction)',
    measures: ['heat-pump', 'heat-pump-water-heater', 'lighting', 'envelope', 'controls'],
    appliesToMultifamily: true,
    incomeEligibleBonus: false,
    amount:
      'Tax DEDUCTION (not a rebate/credit). Tax years beginning 2025: $2.90-$5.81/sq ft with prevailing-wage & apprenticeship (PWA), $0.58-$1.16/sq ft without. 2026 (inflation-adjusted, Rev. Proc. 2025-32): up to ~$5.94/sq ft with PWA / ~$1.19/sq ft without — but only for property whose construction begins on/before 2026-06-30. Requires ≥25% modeled whole-building energy-cost reduction vs ASHRAE 90.1, scaling to 50%+ for max.',
    amountNumericMaxUSD: null,
    cashEligible: false,
    status: 'expiring',
    sunsetDate: '2026-06-30',
    url: 'https://www.irs.gov/newsroom/faqs-for-modification-of-sections-25c-25d-25e-30c-30d-45l-45w-and-179d-under-public-law-119-21-139-stat-72-july-4-2025-commonly-known-as-the-one-big-beautiful-bill-obbb',
  },
  // ⚠️ RE-VERIFY §45L: OBBB (2025) is sunsetting the New Energy Efficient Home Credit. Even before
  //    sunset it applies ONLY to NEW construction / substantial reconstruction, so it is never
  //    claimable on an existing-building LL97 retrofit — including it let a phantom $5,000/unit
  //    "cash" rebate cut net cost on the demo path. Intentionally omitted as a fundable program.
  //    Confirm the §45L sunset/eligibility against the IRS OBBB FAQ before reintroducing it.
  {
    name: 'Con Edison Clean Heat — Commercial & Industrial / Multifamily Prescriptive Heat Pump (5+ unit C&I track)',
    administrator: 'Con Edison (utility) under the NYS Clean Heat statewide framework / NY PSC',
    measures: ['heat-pump', 'heat-pump-water-heater'],
    appliesToMultifamily: true,
    incomeEligibleBonus: true,
    amount:
      'Multifamily prescriptive incentive commonly cited around $5,000 per dwelling unit for full-electrification heat-pump installs; commercial full-electrification ~$120/MMBtu of displaced fossil load. Program cap 50% of project cost or $1,000,000 per account per year.',
    amountNumericMaxUSD: 5000,
    status: 'active',
    sunsetDate: null,
    url: 'https://www.coned.com/en/save-money/rebates-incentives-tax-credits/rebates-incentives-tax-credits-for-commercial-industrial-buildings-customers/clean-heat',
  },
  {
    name: 'NYSERDA Advanced Clean Heating & Cooling — Cold-Climate Through-Wall Heat Pump Field Demonstration (multifamily)',
    administrator: 'NYSERDA',
    measures: ['heat-pump'],
    appliesToMultifamily: true,
    incomeEligibleBonus: false,
    amount:
      'Competitive field demonstration (NOT an as-of-right entitlement): NYSERDA matches selected multifamily buildings with one of five HVAC manufacturers at up to $20,000 per apartment for cold-climate through-wall heat pumps. $7.5M available within a $17.5M program announced April 2026; ~500 apartments total. Applications open through Oct 29 2026, selection required. (The companion $10M packaged-WINDOW heat pump track has no published per-apartment dollar figure and accepts applications through Jun 30 2027.)',
    amountNumericMaxUSD: 20000,
    asOfRight: false,
    status: 'active',
    sunsetDate: '2026-10-29',
    url: 'https://www.nyserda.ny.gov/About/Newsroom/2026-Announcements/2026-04-10-Governor-Hochul-Announces-17-Million-Investment-In-Clean-Heating',
  },
  {
    name: 'NYC Accelerator (free LL97 advisory — not a cash rebate)',
    administrator: "NYC Mayor's Office of Climate & Environmental Justice",
    measures: ['heat-pump', 'heat-pump-water-heater', 'lighting', 'envelope', 'controls', 'solar-pv', 'weatherization'],
    appliesToMultifamily: true,
    incomeEligibleBonus: true,
    amount: 'Free advisory (no cash disbursement)',
    amountNumericMaxUSD: null,
    cashEligible: false,
    status: 'active',
    sunsetDate: null,
    url: 'https://accelerator.nyc',
  },
  // ── Added for FinePrint v2 ──────────────────────────────────────────────────
  {
    name: 'Commercial Property Assessed Clean Energy (C-PACE) — NYC long-term financing for LL97 retrofits',
    administrator: 'NYC Mayor\'s Office of Climate & Environmental Justice / NYCEEC (administrator) via the NYC C-PACE program',
    measures: ['heat-pump', 'heat-pump-water-heater', 'lighting', 'envelope', 'controls', 'solar-pv', 'weatherization'],
    appliesToMultifamily: true,
    incomeEligibleBonus: false,
    amount:
      'Low-cost, long-term (up to ~30-year) 100% financing for eligible energy-efficiency, electrification, and renewable measures, repaid as a senior charge on the property tax bill that transfers with ownership. This is FINANCING, not a cash rebate or grant — it changes cash-flow timing, not net project cost, so it never reduces the net-cost math. Covers up to 100% of hard + soft costs for qualifying LL97 work; commonly stacked beneath Con Ed / NYSERDA incentives and the §48E ITC.',
    amountNumericMaxUSD: null,
    cashEligible: false,
    status: 'active',
    sunsetDate: null,
    url: 'https://www.nyc.gov/site/sustainablebuildings/requirements/property-assessed-clean-energy-financing.page',
  },
  {
    name: 'NYC HPD Affordable Housing Retrofit Fund (AHRF) — decarbonization grants/loans for regulated affordable multifamily',
    administrator: 'NYC Department of Housing Preservation & Development (HPD)',
    measures: ['heat-pump', 'heat-pump-water-heater', 'envelope', 'weatherization', 'controls', 'solar-pv'],
    appliesToMultifamily: true,
    incomeEligibleBonus: true,
    amount:
      'Capital subsidy (grant/low-interest loan) for deep-energy and electrification retrofits of rent-regulated / income-restricted affordable housing in HPD\'s portfolio. Per-unit subsidy is project-negotiated (no fixed as-of-right per-unit figure published); typically layered with Con Ed AMEEP, NYSERDA, and the §48E ITC to reach a fully funded electrification scope. Income-restricted: available only to qualifying affordable buildings.',
    amountNumericMaxUSD: null,
    incomeRestricted: true,
    status: 'active',
    sunsetDate: null,
    url: 'https://www.nyc.gov/site/hpd/services-and-information/sustainability.page',
  },
  {
    name: 'NYC HPD / HDC REDi — Retrofit Electrification Decarbonization Initiative (affordable multifamily electrification)',
    administrator: 'NYC Department of Housing Preservation & Development (HPD) with the NYC Housing Development Corporation (HDC)',
    measures: ['heat-pump', 'heat-pump-water-heater', 'envelope', 'weatherization', 'controls', 'solar-pv'],
    appliesToMultifamily: true,
    incomeEligibleBonus: true,
    amount:
      'Gap financing / capital grant initiative to electrify and decarbonize existing affordable multifamily housing ahead of LL97 deadlines. Per-unit amount is project- and tier-specific (negotiated through HPD/HDC underwriting), not a fixed as-of-right rebate; designed to be stacked with utility (Con Ed AMEEP), NYSERDA, and federal §48E incentives. Income-restricted: regulated affordable housing only.',
    amountNumericMaxUSD: null,
    incomeRestricted: true,
    status: 'active',
    sunsetDate: null,
    url: 'https://www.nyc.gov/site/hpd/services-and-information/sustainability.page',
  },
];

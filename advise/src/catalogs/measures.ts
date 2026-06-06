import type { Measure } from './types.ts';

// Retrofit measure cost / emissions-reduction benchmarks (estimates, sourced via research workflow).
// The seven verified measures: heat-pump, heat-pump-water-heater, controls, envelope,
// weatherization, lighting, solar-pv. Values transcribed from the verified FinePrint catalog.
export const MEASURES: Measure[] = [
  {
    key: 'heat-pump',
    name: 'Air-source / ground-source heat pump for space heating (electrify gas/oil/steam)',
    appliesToFuel: ['gas', 'oil', 'steam'],
    emissionsReductionPctLow: 38,
    emissionsReductionPctHigh: 65,
    typicalCostPerUnitUSDMax: 30000,
    typicalCostPerSqftUSD: 20, // ~$15-30/sf for a whole-building fossil-to-heat-pump conversion
    typicalCostNote:
      '~$5,000/unit prescriptive (Con Ed Clean Heat / MFEEP-E rebate basis) up to ~$15k-30k+/unit installed for whole-building conversion before incentive/IRA stacking; highly building-specific (steam-to-hydronic vs packaged window/PTHP heat pumps vary widely)',
    url: 'https://rmi.org/lower-bills-cleaner-air-heat-pump-benefits-for-homes-relying-on-delivered-fuels/',
  },
  {
    key: 'heat-pump-water-heater',
    name: 'Heat pump water heater (replace gas/oil/steam-fed domestic hot water)',
    appliesToFuel: ['gas', 'oil', 'steam'],
    emissionsReductionPctLow: 50,
    emissionsReductionPctHigh: 60,
    typicalCostPerUnitUSDMax: 12000,
    typicalCostPerSqftUSD: 3, // central HPWH, ~$2-4/sf installed
    typicalCostNote:
      'Central/commercial HPWH systems typically several thousand $ per dwelling unit installed; NYC Accelerator notes incentives reduce project costs ~40-70%',
    url: 'https://www.aceee.org/press-release/2021/11/report-efficient-electric-water-heating-could-slash-multifamily-buildings',
  },
  {
    key: 'controls',
    name: 'Steam-system / boiler controls + building management system (BMS/EMS)',
    appliesToFuel: ['gas', 'oil', 'steam'],
    emissionsReductionPctLow: 15,
    emissionsReductionPctHigh: 25,
    typicalCostPerUnitUSDMax: null,
    typicalCostPerSqftUSD: 1, // boiler controls + BMS, <~$1/sf (Urban Green Council)
    typicalCostNote:
      'Steam distribution + controls upgrades cost less than ~$1/sf; ~$75,000-$100,000 for a medium-size multifamily building (Urban Green Council); Heat-Timer-style boiler controls (outdoor reset, wireless sensors) report 15-50% heating savings (treat vendor upper end cautiously)',
    url: 'https://www.urbangreencouncil.org/blowing-off-steam-answering-your-questions/',
  },
  {
    key: 'envelope',
    name: 'Building envelope / weatherization (air sealing, insulation, windows)',
    appliesToFuel: ['gas', 'oil', 'steam'],
    emissionsReductionPctLow: 11,
    emissionsReductionPctHigh: 25,
    typicalCostPerUnitUSDMax: null,
    typicalCostPerSqftUSD: 8, // air sealing + insulation + windows, ~$5-15/sf (windows-heavy)
    typicalCostNote:
      'NYSERDA Seal-and-Insulate / Comfort Home packages carry $2,000-$3,000+ rebates per package (attics higher); full window replacement is far costlier and project-specific. EPA: 11-15% total energy savings from sealing/insulating; NYC Climate Zone 4A can reach 17-25% bill savings',
    url: 'https://www.nyserda.ny.gov/PutEnergyToWork/Energy-Technology-and-Solutions/Energy-Efficiency-Solutions/Seal-and-Insulate-Your-Building',
  },
  {
    key: 'weatherization',
    name: 'Weatherization package (air sealing + insulation, as an incentive-funded bundle)',
    appliesToFuel: ['gas', 'oil', 'steam'],
    emissionsReductionPctLow: 11,
    emissionsReductionPctHigh: 17,
    typicalCostPerUnitUSDMax: null,
    typicalCostPerSqftUSD: 3, // air-sealing + insulation bundle, ~$2-4/sf
    typicalCostNote:
      'Con Ed MFEEP/AMEEP pays per-unit rates ($5/sf attic insulation, $3-$5/therm air sealing); NYSERDA Comfort Home / Seal-and-Insulate packages $2,000-$3,000+ rebate per package',
    url: 'https://www.urbangreencouncil.org/ll97-in-focus-jumpstarting-multifamily-building-upgrades/',
  },
  {
    key: 'lighting',
    name: 'LED lighting + lighting controls upgrade (common areas / dwelling units)',
    appliesToFuel: ['electric'],
    emissionsReductionPctLow: 2,
    emissionsReductionPctHigh: 8,
    typicalCostPerUnitUSDMax: null,
    typicalCostPerSqftUSD: 2, // LED + controls, ~$1-3/sf
    typicalCostNote:
      'Low-cost, fast-ROI: ~$1-3/sf for common-area LED + occupancy/daylight controls (industry-typical estimate, not a single cited NYC figure); often largely covered by Con Ed / NYSERDA prescriptive lighting incentives (LED $5-$8/lamp, fixtures $45-$150, sensors $10)',
    url: 'https://www.urbangreencouncil.org/ll97-in-focus-jumpstarting-multifamily-building-upgrades/',
  },
  {
    key: 'solar-pv',
    name: 'Rooftop solar PV',
    appliesToFuel: ['electric'],
    emissionsReductionPctLow: 3,
    emissionsReductionPctHigh: 15,
    typicalCostPerUnitUSDMax: null,
    typicalCostPerSqftUSD: 1, // rooftop PV amortized over building floor area (roof-limited)
    typicalCostNote:
      '~$2.65-$4.30/W installed pre-incentive for multifamily/small-commercial (NYSERDA NY-Sun). NY-Sun Megawatt Block + a Multifamily Affordable Housing Incentive (~$1.60-$2.00/W) plus the §48E ITC substantially lower net cost',
    url: 'https://www.nyserda.ny.gov/-/media/Project/Nyserda/Files/Programs/RetrofitNY/20-11-Cost-Effective-Solar-Strategies-for-Affordable-Housing-in-New-York-State.pdf',
  },
];

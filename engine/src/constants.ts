import type { Period } from "./index.ts";

// Penalty rate for exceeding the building emissions limit.
//
// "Such penalty shall be an amount equal to the difference between the
//  building emissions limit established for a calendar year and the actual
//  emissions reported for such calendar year in the building emissions
//  report, multiplied by $268."
// Source: 1 RCNY 103-14(h), "Penalty for exceeding building emissions limits"
// https://www.nyc.gov/assets/buildings/rules/1_RCNY_103-14.pdf
// (implements NYC Admin Code section 28-320.6) — verified 2026-06-06.
export const PENALTY_RATE_CENTS_PER_TCO2E = 26_800;

// Index of each period's column in the factor tables below.
export const PERIOD_COLUMN: Record<Period, 0 | 1 | 2> = {
  "2024-2029": 0,
  "2030-2034": 1,
  "2035-2039": 2,
};

// Building emissions intensity limits ("emissions factors") in tCO2e per sf,
// by Energy Star Portfolio Manager (ESPM) property type. These are the values
// an owner actually computes against; DOB assigns every space an ESPM property
// type, and mixed-use limits are the sum of factor x floor area per type.
//
// Columns: 2024-2029, 2030-2034, 2035-2039.
// Source: 1 RCNY 103-14(d)(3)(i), (iii), and (iv)
// https://www.nyc.gov/assets/buildings/rules/1_RCNY_103-14.pdf
// All three columns transcribed verbatim from the rule text — verified 2026-06-06.
export const ESPM_FACTORS_TCO2E_PER_SQFT: Record<
  string,
  readonly [number, number, number]
> = {
  "Adult Education": [0.00758, 0.003565528, 0.002674146],
  "Ambulatory Surgical Center": [0.01181, 0.008980612, 0.006735459],
  "Automobile Dealership": [0.00675, 0.002824097, 0.002118072],
  "Bank Branch": [0.00987, 0.004036172, 0.003027129],
  "Bowling Alley": [0.00574, 0.003103815, 0.002327861],
  "College/University": [0.00987, 0.002099748, 0.001236322],
  "Convenience Store without Gas Station": [0.00675, 0.003540032, 0.002655024],
  Courthouse: [0.00426, 0.001480533, 0.0011104],
  "Data Center": [0.02381, 0.014791131, 0.011093348],
  "Distribution Center": [0.00574, 0.0009916, 0.000549637],
  "Enclosed Mall": [0.01074, 0.003983803, 0.002987852],
  "Financial Office": [0.00846, 0.003697004, 0.002772753],
  "Fitness Center/Health Club/Gym": [0.00987, 0.003946728, 0.002960046],
  "Food Sales": [0.01181, 0.00520888, 0.00390666],
  "Food Service": [0.01181, 0.007749414, 0.00581206],
  "Hospital (General Medical & Surgical)": [0.02381, 0.007335204, 0.004654044],
  Hotel: [0.00987, 0.003850668, 0.002640017],
  "K-12 School": [0.00675, 0.002230588, 0.001488109],
  Laboratory: [0.02381, 0.026029868, 0.019522401],
  Library: [0.00675, 0.002218412, 0.001663809],
  "Lifestyle Center": [0.00846, 0.00470585, 0.003529387],
  "Mailing Center/Post Office": [0.00426, 0.00198044, 0.00148533],
  "Manufacturing/Industrial Plant": [0.00758, 0.00141703, 0.000975993],
  "Medical Office": [0.01074, 0.002912778, 0.001683565],
  "Movie Theater": [0.01181, 0.005395268, 0.004046451],
  "Multifamily Housing": [0.00675, 0.00334664, 0.002692183],
  Museum: [0.01181, 0.0053958, 0.00404685],
  "Non-Refrigerated Warehouse": [0.00426, 0.000883187, 0.000568051],
  Office: [0.00758, 0.002690852, 0.00165234],
  "Other - Education": [0.00846, 0.002934006, 0.001867699],
  "Other - Entertainment/Public Assembly": [0.00987, 0.002956738, 0.002250122],
  "Other - Lodging/Residential": [0.00758, 0.001901982, 0.001329089],
  "Other - Mall": [0.01074, 0.001928226, 0.001006426],
  "Other - Public Services": [0.00758, 0.003808033, 0.002856025],
  "Other - Recreation": [0.00987, 0.00447957, 0.003359678],
  "Other - Restaurant/Bar": [0.02381, 0.008505075, 0.006378806],
  "Other - Services": [0.01074, 0.001823381, 0.001367536],
  "Other - Specialty Hospital": [0.02381, 0.006321819, 0.004741365],
  "Other - Technology/Science": [0.02381, 0.010446456, 0.007834842],
  "Outpatient Rehabilitation/Physical Therapy": [0.01181, 0.006018323, 0.004513742],
  Parking: [0.00426, 0.000214421, 0.000104943],
  "Performing Arts": [0.00846, 0.002472539, 0.001399345],
  "Personal Services (Health/Beauty, Dry Cleaning, etc.)": [
    0.00574, 0.004843037, 0.003632278,
  ],
  "Pre-school/Daycare": [0.00675, 0.002362874, 0.001772155],
  "Refrigerated Warehouse": [0.00987, 0.002852131, 0.002139098],
  "Repair Services (Vehicle, Shoe, Locksmith, etc.)": [0.00426, 0.002210699, 0.001658024],
  "Residence Hall/Dormitory": [0.00758, 0.002464089, 0.001332459],
  "Residential Care Facility": [0.01138, 0.004893124, 0.004027812],
  Restaurant: [0.01181, 0.004038374, 0.00302878],
  "Retail Store": [0.00758, 0.00210449, 0.00121605],
  "Self-Storage Facility": [0.00426, 0.00061183, 0.000404901],
  "Senior Care Community": [0.01138, 0.004410123, 0.003336443],
  "Social/Meeting Hall": [0.00987, 0.003833108, 0.002874831],
  "Strip Mall": [0.01181, 0.001361842, 0.000600493],
  "Supermarket/Grocery Store": [0.02381, 0.00675519, 0.004256103],
  "Transportation Terminal/Station": [0.00426, 0.000571669, 0.000428752],
  "Urgent Care/Clinic/Other Outpatient": [0.01181, 0.005772375, 0.004329281],
  "Vocational School": [0.00574, 0.004613122, 0.003459842],
  "Wholesale Club/Supercenter": [0.01138, 0.004264962, 0.003198721],
  "Worship Facility": [0.00574, 0.001230602, 0.000866921],
};

// Statutory building emissions limits in tCO2e per sf, by building-code
// occupancy group. Accepted as input for callers that only know the
// certificate-of-occupancy group letter rather than the ESPM property type.
//
// Columns: 2024-2029 (Admin Code section 28-320.3.1), 2030-2034 (28-320.3.2).
// https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-158939
// Both columns verified against the statute text 2026-06-06.
//
// The statute bundles some groups at one coefficient: "E and I-4" share a row,
// as do "S and U", and "B (civic admin, non-production lab, ambulatory health
// care), H, I-2, I-3" share the 0.02381 / 0.01330 row. A bare "B" here means
// general group B; the special B sub-buckets cannot be expressed with a letter
// alone, so callers needing them should pass the ESPM property type instead.
//
// No statutory occupancy-group table exists for 2035-2039 — those limits live
// only in the rule's ESPM property-type table, so the third column comes from
// OCCUPANCY_GROUP_ESPM_PROXY below.
export const OCCUPANCY_GROUP_LIMITS_TCO2E_PER_SQFT: Record<
  string,
  readonly [number, number]
> = {
  A: [0.01074, 0.0042],
  B: [0.00846, 0.00453],
  E: [0.00758, 0.00344],
  F: [0.00574, 0.00167],
  H: [0.02381, 0.0133],
  "I-1": [0.01138, 0.00598],
  "I-2": [0.02381, 0.0133],
  "I-3": [0.02381, 0.0133],
  "I-4": [0.00758, 0.00344],
  M: [0.01181, 0.00403],
  "R-1": [0.00987, 0.00526],
  "R-2": [0.00675, 0.00407],
  S: [0.00426, 0.0011],
  U: [0.00426, 0.0011],
};

// UNVERIFIED: For 2035-2039 no official occupancy-group-to-limit table exists.
// This proxy maps each occupancy group to the ESPM property type that most
// plausibly represents it so projections stay computable; the mapping is this
// engine's own editorial judgment, not DOB's. Results that depend on it carry
// an estimate note in FineResult.notes.
export const OCCUPANCY_GROUP_ESPM_PROXY: Record<string, string> = {
  A: "Other - Entertainment/Public Assembly",
  B: "Office",
  E: "K-12 School",
  F: "Manufacturing/Industrial Plant",
  H: "Laboratory",
  "I-1": "Residential Care Facility",
  "I-2": "Hospital (General Medical & Surgical)",
  "I-3": "Hospital (General Medical & Surgical)",
  "I-4": "Pre-school/Daycare",
  M: "Retail Store",
  "R-1": "Hotel",
  "R-2": "Multifamily Housing",
  S: "Non-Refrigerated Warehouse",
  U: "Parking",
};

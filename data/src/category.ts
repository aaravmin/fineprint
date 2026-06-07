// Building categorization: one address in, "what kind of building is this" out.
//
// Two signals, combined. The always-available base is NYC PLUTO — every tax lot
// carries a DOF building-class code (e.g. "O4" = office) and a land-use code,
// which together give an honest, offline category. When a GOOGLE_PLACES_API_KEY
// is set we enrich that with Google Places, which knows the real-world specific
// type (courthouse, hotel, school) and the named establishment. Places wins for
// the specific label when it answers; PLUTO is the floor so this never returns
// nothing for a real NYC building.
//
// The Places fetcher is injectable so tests run offline, matching lookup.ts.

import type { BuildingFacts, PlutoCharacteristics } from "./types.ts";

export type BroadCategory =
  | "residential"
  | "commercial"
  | "office"
  | "mixed_use"
  | "industrial"
  | "civic_institutional"
  | "vacant_land"
  | "other"
  | "unknown";

export interface BuildingCategory {
  // Coarse bucket, for filtering and color-coding.
  broad: BroadCategory;
  // Best human-readable label available ("Courthouse", "Office building",
  // "Multi-family elevator buildings").
  specific: string;
  // The named establishment Google Places matched, if any ("Thurgood Marshall
  // U.S. Courthouse"). Null when Places wasn't consulted or found nothing.
  placeName: string | null;
  // Raw Google Places type tags, for callers that want the full picture.
  placeTypes: string[];
  // Which datasets contributed, for an honest footnote.
  sources: string[];
  // high = Places gave a specific type; medium = PLUTO building class;
  // low = only land use or nothing.
  confidence: "high" | "medium" | "low";
}

// What a Places lookup returns, normalized. The real fetcher maps Google's
// response into this; tests provide their own.
export interface PlaceLookup {
  primaryType: string | null; // machine type, e.g. "courthouse"
  primaryTypeDisplay: string | null; // human label, e.g. "Courthouse"
  types: string[];
  name: string | null;
}

export type FetchPlace = (query: string) => Promise<PlaceLookup | null>;

export interface CategorizeDeps {
  fetchPlace?: FetchPlace | null;
}

export async function categorizeBuilding(
  facts: BuildingFacts,
  deps: CategorizeDeps = {},
): Promise<BuildingCategory> {
  const base = fromPluto(facts.plutoCharacteristics);
  const fetchPlace = resolveFetchPlace(deps);

  let place: PlaceLookup | null = null;
  if (fetchPlace) {
    try {
      place = await fetchPlace(facts.address);
    } catch {
      // A Places failure must never sink categorization — fall back to PLUTO.
      place = null;
    }
  }

  return combine(base, place);
}

interface PlutoCategory {
  broad: BroadCategory;
  specific: string;
  source: string;
  confidence: "medium" | "low";
}

function fromPluto(pluto: PlutoCharacteristics | null): PlutoCategory | null {
  if (!pluto) {
    return null;
  }

  const byClass = pluto.buildingClass
    ? BUILDING_CLASS[pluto.buildingClass[0].toUpperCase()]
    : undefined;
  const byLandUse = pluto.landUse ? LAND_USE[pluto.landUse] : undefined;

  if (byClass) {
    return {
      broad: byClass.broad,
      specific: byClass.label,
      source: `NYC PLUTO (building class ${pluto.buildingClass})`,
      confidence: "medium",
    };
  }
  if (byLandUse) {
    return {
      broad: byLandUse.broad,
      specific: byLandUse.label,
      source: `NYC PLUTO (land use ${pluto.landUse})`,
      confidence: "low",
    };
  }
  return null;
}

function combine(
  base: PlutoCategory | null,
  place: PlaceLookup | null,
): BuildingCategory {
  if (place && place.primaryTypeDisplay) {
    const placeBroad = broadFromPlaceTypes([place.primaryType ?? "", ...place.types]);
    return {
      broad: placeBroad ?? base?.broad ?? "unknown",
      specific: place.primaryTypeDisplay,
      placeName: place.name,
      placeTypes: place.types,
      sources: ["Google Places", base?.source].filter((s): s is string => !!s),
      confidence: "high",
    };
  }

  if (base) {
    return {
      broad: base.broad,
      specific: base.specific,
      placeName: place?.name ?? null,
      placeTypes: place?.types ?? [],
      sources: [base.source],
      confidence: base.confidence,
    };
  }

  return {
    broad: "unknown",
    specific: "Unknown — no building-class or place data",
    placeName: null,
    placeTypes: [],
    sources: [],
    confidence: "low",
  };
}

// DOF building-class first letter -> category. The letter is the reliable axis;
// the digit refines size/subtype, which we fold into the land-use fallback.
const BUILDING_CLASS: Record<string, { broad: BroadCategory; label: string }> = {
  A: { broad: "residential", label: "One-family dwelling" },
  B: { broad: "residential", label: "Two-family dwelling" },
  C: { broad: "residential", label: "Walk-up apartments" },
  D: { broad: "residential", label: "Elevator apartments" },
  E: { broad: "industrial", label: "Warehouse" },
  F: { broad: "industrial", label: "Factory / industrial building" },
  G: { broad: "commercial", label: "Garage or gas station" },
  H: { broad: "commercial", label: "Hotel" },
  I: { broad: "civic_institutional", label: "Hospital or health facility" },
  J: { broad: "commercial", label: "Theatre" },
  K: { broad: "commercial", label: "Store / retail building" },
  L: { broad: "commercial", label: "Loft building" },
  M: { broad: "civic_institutional", label: "Place of worship" },
  N: { broad: "civic_institutional", label: "Care home / institution" },
  O: { broad: "office", label: "Office building" },
  P: { broad: "civic_institutional", label: "Cultural / public assembly" },
  Q: { broad: "other", label: "Outdoor recreation facility" },
  R: { broad: "residential", label: "Condominium" },
  S: { broad: "mixed_use", label: "Residential building with stores" },
  T: { broad: "other", label: "Transportation facility" },
  U: { broad: "other", label: "Utility" },
  V: { broad: "vacant_land", label: "Vacant land" },
  W: { broad: "civic_institutional", label: "Educational facility" },
  Y: { broad: "civic_institutional", label: "Government / public-use building" },
  Z: { broad: "other", label: "Miscellaneous" },
};

const LAND_USE: Record<string, { broad: BroadCategory; label: string }> = {
  "01": { broad: "residential", label: "One & two family buildings" },
  "02": { broad: "residential", label: "Multi-family walk-up buildings" },
  "03": { broad: "residential", label: "Multi-family elevator buildings" },
  "04": { broad: "mixed_use", label: "Mixed residential & commercial buildings" },
  "05": { broad: "commercial", label: "Commercial & office buildings" },
  "06": { broad: "industrial", label: "Industrial & manufacturing" },
  "07": { broad: "other", label: "Transportation & utility" },
  "08": { broad: "civic_institutional", label: "Public facilities & institutions" },
  "09": { broad: "other", label: "Open space & outdoor recreation" },
  "10": { broad: "other", label: "Parking facilities" },
  "11": { broad: "vacant_land", label: "Vacant land" },
};

// Map Google Places type tags to a broad bucket. First match wins, so the most
// specific civic/commercial signals are checked before generic ones.
const PLACE_TYPE_BROAD: Array<{ broad: BroadCategory; types: string[] }> = [
  {
    broad: "civic_institutional",
    types: [
      "courthouse",
      "city_hall",
      "local_government_office",
      "embassy",
      "police",
      "fire_station",
      "post_office",
      "school",
      "primary_school",
      "secondary_school",
      "university",
      "library",
      "hospital",
      "doctor",
      "place_of_worship",
      "church",
      "synagogue",
      "mosque",
      "museum",
      "city_hall",
    ],
  },
  {
    broad: "office",
    types: ["corporate_office", "accounting", "lawyer", "insurance_agency"],
  },
  {
    broad: "commercial",
    types: [
      "store",
      "shopping_mall",
      "supermarket",
      "restaurant",
      "cafe",
      "bar",
      "bank",
      "lodging",
      "hotel",
      "gym",
      "pharmacy",
      "car_dealer",
      "gas_station",
    ],
  },
  {
    broad: "residential",
    types: ["apartment_complex", "apartment_building", "housing_complex", "lodging"],
  },
];

function broadFromPlaceTypes(types: string[]): BroadCategory | null {
  for (const bucket of PLACE_TYPE_BROAD) {
    if (types.some(type => bucket.types.includes(type))) {
      return bucket.broad;
    }
  }
  return null;
}

function resolveFetchPlace(deps: CategorizeDeps): FetchPlace | null {
  if (deps.fetchPlace !== undefined) {
    return deps.fetchPlace;
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  return apiKey ? makeRealFetchPlace(apiKey) : null;
}

// Google Places API (New) Text Search. Returns the single best match for the
// address, normalized to PlaceLookup. The field mask keeps the response (and
// the bill) to just what categorization needs.
function makeRealFetchPlace(apiKey: string): FetchPlace {
  const url = "https://places.googleapis.com/v1/places:searchText";

  return async (query: string) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.displayName,places.primaryType,places.primaryTypeDisplayName,places.types",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(
        `Google Places responded ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      places?: Array<{
        displayName?: { text?: string };
        primaryType?: string;
        primaryTypeDisplayName?: { text?: string };
        types?: string[];
      }>;
    };

    const place = data.places?.[0];
    if (!place) {
      return null;
    }

    return {
      primaryType: place.primaryType ?? null,
      primaryTypeDisplay: place.primaryTypeDisplayName?.text ?? null,
      types: place.types ?? [],
      name: place.displayName?.text ?? null,
    };
  };
}

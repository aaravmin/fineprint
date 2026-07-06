// The canonical retrofit category taxonomy: the infrastructure buckets an owner
// reasons about separately (lighting vs heating vs elevators ...). It lives in
// the engine because both the data layer (server catalog) and the client reach
// `fineprint-engine`, so there is one source of truth for the vocabulary.
// Framework-free by design (no React, no lucide) — the client layers icons on
// top in client/src/lib/retrofit/categoryRegistry.ts.

export type RetrofitCategory =
  | "lighting"
  | "heating"
  | "cooling"
  | "hot_water"
  | "envelope"
  | "controls"
  | "electrical"
  | "elevators"
  | "solar"
  | "water";

export interface CategoryDef {
  id: RetrofitCategory;
  displayName: string;
  // The building-systems (SystemKey) strings that roll up into this category.
  // "controls" and "water" have no dedicated system key today.
  systemKeys: string[];
  sortOrder: number;
  // A registered-but-not-yet-live category (water) is `false` so the UI can list
  // it without offering it.
  enabled: boolean;
}

export const RETROFIT_CATEGORIES: CategoryDef[] = [
  { id: "lighting", displayName: "Lighting", systemKeys: ["lighting"], sortOrder: 1, enabled: true },
  { id: "heating", displayName: "Heating & steam", systemKeys: ["heating_plant"], sortOrder: 2, enabled: true },
  { id: "cooling", displayName: "Cooling", systemKeys: ["cooling"], sortOrder: 3, enabled: true },
  { id: "hot_water", displayName: "Hot water", systemKeys: ["domestic_hot_water"], sortOrder: 4, enabled: true },
  { id: "envelope", displayName: "Envelope", systemKeys: ["envelope"], sortOrder: 5, enabled: true },
  { id: "controls", displayName: "Controls (BMS)", systemKeys: [], sortOrder: 6, enabled: true },
  { id: "electrical", displayName: "Electrical", systemKeys: ["electrical_service"], sortOrder: 7, enabled: true },
  { id: "elevators", displayName: "Elevators", systemKeys: ["elevators"], sortOrder: 8, enabled: true },
  { id: "solar", displayName: "Solar", systemKeys: ["solar_pv"], sortOrder: 9, enabled: true },
  // Potable-water conservation carries no LL97 emissions and no measure yet;
  // registered disabled so it can be turned on later without a schema change.
  { id: "water", displayName: "Water", systemKeys: [], sortOrder: 10, enabled: false },
];

const SYSTEM_TO_CATEGORY: Record<string, RetrofitCategory> = {
  lighting: "lighting",
  heating_plant: "heating",
  cooling: "cooling",
  domestic_hot_water: "hot_water",
  envelope: "envelope",
  electrical_service: "electrical",
  elevators: "elevators",
  solar_pv: "solar",
};

// The category a building system belongs to. Used as a legacy fallback for
// measures/plans persisted before measures carried an explicit category — new
// measures set `category` directly and never rely on this. Controls (BMS) has no
// system key, so an unmapped system falls there.
export function categoryForSystem(system: string): RetrofitCategory {
  return SYSTEM_TO_CATEGORY[system] ?? "controls";
}

export function categoryById(id: string): CategoryDef | undefined {
  return RETROFIT_CATEGORIES.find(category => category.id === id);
}

export function categoryDisplayName(id: string): string {
  return categoryById(id)?.displayName ?? id;
}

// The enabled categories, in display order — the set the UI offers as toggles
// and groups measures under.
export function enabledCategories(): CategoryDef[] {
  return RETROFIT_CATEGORIES.filter(category => category.enabled).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

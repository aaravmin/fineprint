import type { LucideIcon } from "lucide-react";
import { ShieldCheck } from "lucide-react";

import {
  type RetrofitCategory,
  categoryDisplayName,
  enabledCategories,
  // biome-ignore lint/correctness/noUndeclaredDependencies: fineprint-engine is a tsconfig path alias to ../engine/src, resolved by TS and Turbopack, not an npm package.
} from "fineprint-engine";

import { categoryIcon } from "@/lib/retrofit/categoryRegistry";

// The categories a building's progress is tracked against: the statutory
// "compliance" bucket (LL97 / Article 321 filings, always on and not toggleable)
// followed by the enabled retrofit categories from the engine taxonomy. The
// retrofit vocabulary lives framework-free in engine/src/categories.ts; here it
// gains the presentation the tracked-progress UI reads (label, icon, blurb).

export type TrackedCategory = RetrofitCategory | "compliance";

export interface TrackedCategoryDef {
  id: TrackedCategory;
  label: string;
  icon: LucideIcon;
  blurb: string;
  toggleable: boolean;
}

const COMPLIANCE_LABEL = "Compliance & filings";

const COMPLIANCE_BLURB =
  "Statutory LL97 and Article 321 filings, reports, and deadlines. Always tracked.";

// One plain-language line per retrofit category. The engine taxonomy carries no
// blurb (it is framework- and copy-free), so the tracked-progress UI sources it
// here alongside the icon.
const RETROFIT_BLURB: Record<RetrofitCategory, string> = {
  lighting: "LED conversions, occupancy sensors, and daylighting controls.",
  heating: "Boiler, steam, and heating-plant upgrades.",
  cooling: "Chillers, air conditioning, and cooling-plant efficiency.",
  hot_water: "Domestic hot water heaters and distribution.",
  envelope: "Insulation, windows, roofing, and air sealing.",
  controls: "Building management and automation systems.",
  electrical: "Service upgrades and electrification readiness.",
  elevators: "Elevator modernization and regenerative drives.",
  solar: "Rooftop photovoltaics and on-site generation.",
  water: "Potable-water conservation measures.",
};

export const TRACKED_CATEGORIES: TrackedCategoryDef[] = [
  {
    id: "compliance",
    label: COMPLIANCE_LABEL,
    icon: ShieldCheck,
    blurb: COMPLIANCE_BLURB,
    toggleable: false,
  },
  ...enabledCategories().map((category) => ({
    id: category.id,
    label: categoryDisplayName(category.id),
    icon: categoryIcon(category.id),
    blurb: RETROFIT_BLURB[category.id],
    toggleable: true,
  })),
];

export function categoryLabel(id: string): string {
  if (id === "compliance") {
    return COMPLIANCE_LABEL;
  }

  return categoryDisplayName(id);
}

export function categoryIconFor(id: string): LucideIcon {
  if (id === "compliance") {
    return ShieldCheck;
  }

  return categoryIcon(id as RetrofitCategory);
}

import type { LucideIcon } from "lucide-react";
import {
  ArrowUpDown,
  BrickWall,
  Droplet,
  Droplets,
  Flame,
  Lightbulb,
  SlidersHorizontal,
  Snowflake,
  Sun,
  Zap,
} from "lucide-react";

import {
  type RetrofitCategory,
  // biome-ignore lint/correctness/noUndeclaredDependencies: fineprint-engine is a tsconfig path alias to ../engine/src, resolved by TS and Turbopack, not an npm package.
} from "fineprint-engine";

// The lucide icon each retrofit category wears. Presentation only — the
// vocabulary itself lives in the framework-free engine (engine/src/categories.ts)
// so the data layer can share it; the icons live here so the building-systems
// tiles and the retrofit-plan groups read from one source and never drift.
const CATEGORY_ICON: Record<RetrofitCategory, LucideIcon> = {
  lighting: Lightbulb,
  heating: Flame,
  cooling: Snowflake,
  hot_water: Droplets,
  envelope: BrickWall,
  controls: SlidersHorizontal,
  electrical: Zap,
  elevators: ArrowUpDown,
  solar: Sun,
  water: Droplet,
};

export function categoryIcon(id: RetrofitCategory): LucideIcon {
  return CATEGORY_ICON[id];
}

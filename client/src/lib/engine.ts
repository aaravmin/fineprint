import { computeAllPeriods, type BuildingInput, type FineResult } from "fineprint-engine";
import type { Building } from "@/module_bindings/types";

export type { FineResult };

export function toBuildingInput(building: Building): BuildingInput | null {
  if (building.annualEmissionsTco2E === undefined || building.usesJson === undefined) {
    return null;
  }
  const occupancyGroups: Array<{ group: string; sqft: number }> = JSON.parse(building.usesJson);
  return {
    grossFloorAreaSqft: building.sqft,
    occupancyGroups,
    annualEmissionsTco2e: building.annualEmissionsTco2E,
    isArticle321: building.isAffordable,
  };
}

export function computePeriods(building: Building): FineResult[] | null {
  const input = toBuildingInput(building);
  if (!input) return null;
  try {
    return computeAllPeriods(input);
  } catch {
    return null;
  }
}

export function fmtUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function fmtTco2e(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} tCO₂e`;
}

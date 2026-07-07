// Turns a task row + its building row into the DraftInput a policy consumes.
// The building's JSON columns (uses_json, provenance_json) are parsed here so
// policies never see raw storage. Pure; the worker just calls it.

import type { DraftInput, ProvenanceNote } from "./policies/types.ts";

interface TaskLike {
  title: string;
  kind: string;
  law_id: string;
  fine_estimate_usd: number | null;
  deadline?: string | null;
}

interface BuildingLike {
  address: string;
  bbl: string | null;
  sqft: number;
  is_affordable: boolean;
  annual_emissions_tco2e: number | null;
  uses_json: string | null;
  ll97_covered: boolean | null;
  provenance_json: string | null;
}

export function draftInputFrom(
  task: TaskLike,
  building: BuildingLike | undefined,
): DraftInput {
  return {
    title: task.title,
    kind: task.kind,
    lawId: task.law_id,
    address: building?.address ?? "unknown",
    sqft: building?.sqft ?? 0,
    isAffordable: building?.is_affordable ?? false,
    fineEstimateUsd: task.fine_estimate_usd ?? undefined,
    deadline: task.deadline ? new Date(task.deadline) : undefined,
    bbl: building?.bbl ?? undefined,
    annualEmissionsTco2e: building?.annual_emissions_tco2e ?? undefined,
    uses:
      parseJsonColumn<Array<{ group: string; sqft: number }>>(building?.uses_json) ?? [],
    ll97Covered: building?.ll97_covered ?? undefined,
    provenance: parseJsonColumn<ProvenanceNote[]>(building?.provenance_json) ?? [],
  };
}

// Storage corruption must never crash a worker mid-draft.
function parseJsonColumn<T>(json: string | null | undefined): T | null {
  if (!json) {
    return null;
  }

  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// Turns a task row + its building row into the DraftInput a policy consumes.
// The building's JSON columns (usesJson, provenanceJson) are parsed here so
// policies never see raw storage. Pure; the worker just calls it.

import type { DraftInput, ProvenanceNote } from "./policies/types.ts";

interface TaskLike {
  title: string;
  kind: string;
  lawId: string;
  fineEstimateUsd: number | undefined;
  deadline?: { toDate(): Date };
}

interface BuildingLike {
  address: string;
  bbl: string | undefined;
  sqft: number;
  isAffordable: boolean;
  annualEmissionsTco2E: number | undefined; // codegen capitalizes the trailing "e"
  usesJson: string | undefined;
  ll97Covered: boolean | undefined;
  provenanceJson: string | undefined;
}

export function draftInputFrom(
  task: TaskLike,
  building: BuildingLike | undefined,
): DraftInput {
  return {
    title: task.title,
    kind: task.kind,
    lawId: task.lawId,
    address: building?.address ?? "unknown",
    sqft: building?.sqft ?? 0,
    isAffordable: building?.isAffordable ?? false,
    fineEstimateUsd: task.fineEstimateUsd,
    deadline: task.deadline?.toDate(),
    bbl: building?.bbl,
    annualEmissionsTco2e: building?.annualEmissionsTco2E,
    uses:
      parseJsonColumn<Array<{ group: string; sqft: number }>>(building?.usesJson) ?? [],
    ll97Covered: building?.ll97Covered,
    provenance: parseJsonColumn<ProvenanceNote[]>(building?.provenanceJson) ?? [],
  };
}

// Storage corruption must never crash a worker mid-draft.
function parseJsonColumn<T>(json: string | undefined): T | null {
  if (!json) {
    return null;
  }

  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

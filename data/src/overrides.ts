// Owner-supplied corrections to a building's systems dossier. The intake resolves
// systems from city records + heuristics; an owner who knows the truth (or has a
// blueprint / spec sheet) can correct specific facts, and those win. This is the
// single place the precedence rule lives: owner-provided > city record >
// heuristic. Overriding the inferred fuel/vintage/condition reshapes the retrofit
// recommendations on recompute; it deliberately does NOT touch estAnnualTco2e,
// which comes from the building's metered LL84 emissions, not the inferred label.

import type { BuildingSystems, EvidenceRef, SystemAssessment, SystemKey } from "./types.ts";

// One owner correction to a single field. `recordId` optionally cites an uploaded
// record (a row in user_records) as the source shown in the UI.
export interface OverrideValue {
  value: string | number;
  recordId?: string;
  enteredAt?: string;
}

// Per-building overrides, keyed by system then field. Only the fields the dossier
// exposes are honored; unknown fields are ignored.
export type SystemOverride = {
  fuel?: OverrideValue;
  vintageYear?: OverrideValue;
  condition?: OverrideValue;
  presence?: OverrideValue;
};

export type UserOverrides = {
  [system in SystemKey]?: SystemOverride;
};

const OWNER_DATASET = "Owner-provided record";
const OWNER_DATASET_ID = "user";

const CONDITIONS = new Set(["failing", "aging", "serviceable", "recently_replaced", "unknown"]);
const PRESENCES = new Set(["confirmed", "assumed", "none", "unknown"]);

function ownerEvidence(fieldLabel: string, override: OverrideValue): EvidenceRef {
  return {
    dataset: OWNER_DATASET,
    datasetId: OWNER_DATASET_ID,
    note: `Owner-provided ${fieldLabel}${override.recordId ? ` (record ${override.recordId})` : ""}`,
  } as EvidenceRef;
}

// Apply owner corrections on top of the resolved dossier. Corrected systems get
// presence "confirmed", confidence "high", and an owner EvidenceRef prepended so
// the tile can render "Source: owner-provided". Returns the input unchanged when
// there are no overrides.
export function applyUserOverrides(
  systems: BuildingSystems,
  overrides: UserOverrides | undefined,
): BuildingSystems {
  if (!overrides || Object.keys(overrides).length === 0) {
    return systems;
  }

  let touched = false;

  const nextSystems = systems.systems.map(system => {
    const patch = overrides[system.system];
    if (!patch || Object.keys(patch).length === 0) {
      return system;
    }
    touched = true;

    const next: SystemAssessment = { ...system };
    const ownerRefs: EvidenceRef[] = [];

    if (patch.fuel !== undefined) {
      next.fuel = String(patch.fuel.value);
      ownerRefs.push(ownerEvidence("fuel", patch.fuel));
    }
    if (patch.vintageYear !== undefined) {
      const year = Number(patch.vintageYear.value);
      if (Number.isFinite(year)) {
        next.vintageYear = year;
        ownerRefs.push(ownerEvidence("install year", patch.vintageYear));
      }
    }
    if (patch.condition !== undefined && CONDITIONS.has(String(patch.condition.value))) {
      next.condition = String(patch.condition.value) as SystemAssessment["condition"];
      ownerRefs.push(ownerEvidence("condition", patch.condition));
    }
    if (patch.presence !== undefined && PRESENCES.has(String(patch.presence.value))) {
      next.presence = String(patch.presence.value) as SystemAssessment["presence"];
    }

    next.confidence = "high";
    if (next.presence === "unknown" || next.presence === "none") {
      next.presence = "confirmed";
    }
    next.evidence = [...ownerRefs, ...system.evidence];
    return next;
  });

  if (!touched) {
    return systems;
  }

  return {
    ...systems,
    systems: nextSystems,
    attributionNote: `${systems.attributionNote} Owner-provided corrections applied where present.`,
  };
}

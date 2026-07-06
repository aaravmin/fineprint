// Turns a task row + its building row into the DraftInput a policy consumes.
// The building's JSON columns (usesJson, provenanceJson, systemsJson,
// compliancePlanJson) are parsed here so policies never see raw storage. Pure;
// the worker just calls it.

import type {
  DraftInput,
  MeasureHighlight,
  ProvenanceNote,
  SystemDriver,
} from "./policies/types.ts";

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
  systemsJson: string | undefined;
  compliancePlanJson: string | undefined;
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
    systemDrivers: topSystemDrivers(building?.systemsJson),
    measureHighlights: topMeasureHighlights(building?.compliancePlanJson),
  };
}

interface StoredSystem {
  system: string;
  headline: string;
  condition: string;
  shareOfEmissions: number | null;
}

// The systems that actually drive emissions, biggest share first. A system with
// no attributed share can't be ranked as a driver, so it is left out here even
// though the dossier still carries it.
function topSystemDrivers(systemsJson: string | undefined): SystemDriver[] {
  const systems = parseJsonColumn<{ systems: StoredSystem[] }>(systemsJson)?.systems;
  if (!systems) {
    return [];
  }

  return systems
    .filter(system => system.shareOfEmissions !== null && system.shareOfEmissions > 0)
    .sort((a, b) => (b.shareOfEmissions ?? 0) - (a.shareOfEmissions ?? 0))
    .slice(0, 3)
    .map(system => ({
      system: system.system,
      headline: system.headline,
      condition: system.condition,
      shareOfEmissions: system.shareOfEmissions,
    }));
}

interface StoredMeasure {
  name: string;
  targetSystem: string;
  applicability: string;
  capexUsd: number | null;
  estReductionTco2e: number | null;
  why: string;
}

// The three measures worth leading with: recommended ones first, then the
// largest cut. Already-done and not-applicable measures are the plan's context,
// not its pitch, so they don't surface here.
function topMeasureHighlights(compliancePlanJson: string | undefined): MeasureHighlight[] {
  const measures = parseJsonColumn<{
    personalization?: { measures?: StoredMeasure[] };
  }>(compliancePlanJson)?.personalization?.measures;
  if (!measures) {
    return [];
  }

  const rank = (measure: StoredMeasure) => (measure.applicability === "recommended" ? 0 : 1);

  return measures
    .filter(
      measure =>
        measure.applicability === "recommended" || measure.applicability === "applicable",
    )
    .sort(
      (a, b) => rank(a) - rank(b) || (b.estReductionTco2e ?? 0) - (a.estReductionTco2e ?? 0),
    )
    .slice(0, 3)
    .map(measure => ({
      name: measure.name,
      targetSystem: measure.targetSystem,
      capexUsd: measure.capexUsd,
      estReductionTco2e: measure.estReductionTco2e,
      why: measure.why,
    }));
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

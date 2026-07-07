// Task specs: the rows the backend spawns for a building, computed from the
// law registry. The database cannot import this package (the same boundary the
// old database module had), so callers — the intake worker, the ingest CLI, the
// dashboard — compute specs here and pass them into the add_building /
// ingest_building RPCs, which validate the shape and insert atomically.

import { applicableLaws, LAWS, type BuildingProfile, type Law } from "./laws";

export interface TaskSpec {
  law_id: string;
  kind: string;
  title: string;
  deadline: string; // ISO timestamp
  fine_estimate_usd: number | null;
}

const FALLBACK_REVIEW_WINDOW_MS = 365 * 86_400_000;

// The task's deadline is the law's real next statutory deadline. When the
// cycle can't be dated from what intake resolved (a missing tax block or
// community district), fall back to a one-year review window rather than
// inventing a date.
function deadlineFor(law: Law, asOf: Date, profile: BuildingProfile): string {
  const next = law.nextDeadline(asOf, profile);
  if (next === null) {
    return new Date(asOf.getTime() + FALLBACK_REVIEW_WINDOW_MS).toISOString();
  }
  return next.toISOString();
}

function specFor(
  law: Law,
  address: string,
  profile: BuildingProfile,
  asOf: Date,
  engineFineUsd?: number,
): TaskSpec {
  const isLl97Law = law.id === "ll97" || law.id === "art321";

  // LL97 and Article 321 carry the engine's real per-building fine. When the
  // engine had no emissions to price, the task carries null — never a stub —
  // mirroring the building row. Every other law carries its registry penalty.
  const fine = isLl97Law ? (engineFineUsd ?? null) : law.penaltyUsd(profile);

  return {
    law_id: law.id,
    kind: law.kind,
    title: `${law.name} — ${address}`,
    deadline: deadlineFor(law, asOf, profile),
    fine_estimate_usd: fine,
  };
}

// Ingest path: DOB's covered-list flags decide which laws bind when provided;
// the profile heuristic is only the fallback for unknown buildings. LL97 and
// Article 321 carry the engine's real fine when the pipeline computed one.
export function taskSpecsForIngest(
  address: string,
  profile: BuildingProfile,
  coveredLawIds: string[],
  engineFineUsd: number | undefined,
  asOf: Date = new Date(),
): TaskSpec[] {
  const laws = (
    coveredLawIds.length > 0
      ? LAWS.filter(law => coveredLawIds.includes(law.id))
      : applicableLaws(profile)
  ).filter(law => law.kind !== "pace_financing");

  return laws.map(law => specFor(law, address, profile, asOf, engineFineUsd));
}

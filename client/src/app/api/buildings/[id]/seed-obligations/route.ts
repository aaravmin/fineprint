import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

// biome-ignore lint/correctness/noUndeclaredDependencies: fineprint-laws is a tsconfig path alias to ../data/laws.ts, not an npm package.
import { applicableLaws, type BuildingProfile } from "fineprint-laws";

import { createAdminSupabase } from "@/lib/supabase/admin";

// seed_obligations, as an HTTP route. One obligation per law that binds the
// building, from the same applicability the tasks use. Idempotent: a law that
// already has an obligation is skipped, so re-running only backfills new ones.
// Replaces spacetimedb seed_obligations. The law registry is TypeScript, so this
// stays server-side rather than living in SQL.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const buildingId = Number(id);
  if (!Number.isInteger(buildingId)) {
    return NextResponse.json({ error: "bad building id" }, { status: 400 });
  }

  const supabase = createAdminSupabase();

  const { data: building } = await supabase
    .from("buildings")
    .select("*")
    .eq("id", buildingId)
    .maybeSingle();

  if (!building || building.owner !== userId) {
    return NextResponse.json({ error: `no building with id ${buildingId}` }, { status: 404 });
  }

  const profile: BuildingProfile = {
    sqft: building.sqft,
    isAffordable: building.is_affordable,
    bbl: building.bbl ?? undefined,
    numFloors: building.num_floors ?? undefined,
    unitsResidential: building.units_residential ?? undefined,
    communityDistrict: building.community_district ?? undefined,
    energyStarScore: building.energy_star_score ?? undefined,
  };

  const { data: existing } = await supabase
    .from("obligations")
    .select("law_id")
    .eq("building_id", buildingId);
  const alreadyHave = new Set((existing ?? []).map(row => row.law_id));

  const now = new Date();
  let created = 0;

  for (const law of applicableLaws(profile)) {
    if (alreadyHave.has(law.id)) {
      continue;
    }

    const next = law.nextDeadline(now, profile);
    const { data: inserted, error } = await supabase
      .from("obligations")
      .insert({
        owner: userId,
        building_id: buildingId,
        law_id: law.id,
        title: law.name,
        status: "not_started",
        due_date: next === null ? null : next.toISOString(),
      })
      .select("id")
      .single();
    if (error || !inserted) {
      continue;
    }

    await supabase.from("binder_events").insert({
      owner: userId,
      building_id: buildingId,
      obligation_id: inserted.id,
      law_id: law.id,
      kind: "obligation_created",
      summary: `Obligation opened: ${law.name}`,
    });
    created += 1;
  }

  await supabase.from("events").insert({
    owner: userId,
    kind: "binder_seeded",
    payload: `${created} obligations seeded for building ${buildingId}`,
  });

  return NextResponse.json({ ok: true, created });
}

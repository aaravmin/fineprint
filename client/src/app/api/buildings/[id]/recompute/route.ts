import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

// biome-ignore lint/correctness/noUndeclaredDependencies: fineprint-data is a tsconfig path alias to ../data/src, resolved by TS and Turbopack, not an npm package (same as fineprint-engine).
import { prepareIntake, type UserOverrides } from "fineprint-data";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { ingestBuilding } from "@/lib/supabase/ingest";

// Re-derive a building from its address and the owner's saved corrections, then
// re-ingest. The owner edits a system fact (fuel, vintage, condition) via
// building_overrides; those overrides feed prepareIntake, which reshapes the
// systems dossier, retrofit plan, and deadlines, and ingest_building upserts the
// building row in place. Runs service-role after the caller's ownership is
// checked, exactly like the approve route.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    .select("id, owner, address")
    .eq("id", buildingId)
    .maybeSingle();

  if (!building || building.owner !== userId) {
    return NextResponse.json({ error: `building ${buildingId} not found` }, { status: 404 });
  }

  const { data: overrideRow } = await supabase
    .from("building_overrides")
    .select("data")
    .eq("building_id", buildingId)
    .maybeSingle();

  const overrides = (overrideRow?.data as UserOverrides | undefined) ?? undefined;

  try {
    const { ingestArgs } = await prepareIntake(building.address, undefined, overrides);
    await ingestBuilding(ingestArgs, building.owner);
  } catch (err) {
    return NextResponse.json(
      { error: `could not recompute building ${buildingId}: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

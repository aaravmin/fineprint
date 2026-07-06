import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { dispatchTaskRun } from "@/lib/jobs/dispatch";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { type IngestArgs, ingestBuilding } from "@/lib/supabase/ingest";

// approve, as an HTTP route. For an intake, approving is what creates the
// building: replay the resolved city data the agent attached to its submission
// through the ingest_building RPC (one transaction: building + obligation
// tasks), then fire an agent for each freshly-spawned obligation. For an
// ordinary draft, approving just records the sign-off. Replaces spacetimedb
// approve. Writes go through the service role; the caller's ownership is checked
// explicitly (the reducer did the same with task.owner == ctx.sender).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) {
    return NextResponse.json({ error: "bad task id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const note = typeof body.note === "string" ? body.note : "";

  const supabase = createAdminSupabase();

  const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();

  if (!task || task.owner !== userId) {
    return NextResponse.json({ error: `task ${taskId} not found` }, { status: 404 });
  }
  if (task.status !== "in_review") {
    return NextResponse.json({ error: `task ${taskId} is not in review` }, { status: 409 });
  }

  let freshTaskIds: number[] = [];

  if (task.kind === "building_intake") {
    const { data: latest } = await supabase
      .from("submissions")
      .select("payload_json")
      .eq("task_id", taskId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest?.payload_json) {
      return NextResponse.json(
        { error: `intake ${taskId} has no ingest payload — reject it and re-request the address` },
        { status: 422 },
      );
    }

    const buildingId = await ingestBuilding(latest.payload_json as unknown as IngestArgs, task.owner);

    const { data: freshTasks } = await supabase
      .from("tasks")
      .select("id")
      .eq("building_id", buildingId)
      .eq("status", "open");
    freshTaskIds = (freshTasks ?? []).map((row) => row.id);
  }

  // Record the sign-off first so it is durable regardless of what dispatch does.
  await supabase.from("approvals").insert({
    owner: task.owner,
    task_id: taskId,
    approved_by: userId,
    verdict: "approved",
    note,
  });
  await supabase.from("tasks").update({ status: "approved" }).eq("id", taskId);
  await supabase.from("events").insert({
    owner: task.owner,
    kind: "task_approved",
    payload: note || "approved",
    task_id: taskId,
  });

  // The ingest spawned obligation tasks as 'open'. With no dispatcher polling
  // the queue, fire an agent for each; a dispatch that fails marks only that
  // task failed instead of sinking the whole approval.
  for (const freshId of freshTaskIds) {
    try {
      await dispatchTaskRun(freshId, { idempotencyKey: `draft-${freshId}` });
    } catch {
      await supabase.from("tasks").update({ status: "failed", trigger_run_id: null }).eq("id", freshId);
    }
  }

  return NextResponse.json({ ok: true, dispatched: freshTaskIds.length });
}

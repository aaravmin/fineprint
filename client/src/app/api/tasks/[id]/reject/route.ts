import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { dispatchTaskRun } from "@/lib/jobs/dispatch";
import { createAdminSupabase } from "@/lib/supabase/admin";

// reject, as an HTTP route. Rejecting an intake is terminal — the same lookup
// would reproduce the same answer, so re-request with a corrected address.
// Rejecting an ordinary draft returns the task to the queue and fires a fresh
// agent (there is no dispatcher to pick it back up). Replaces spacetimedb
// reject. Service-role writes; ownership checked explicitly.
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

  await supabase.from("approvals").insert({
    owner: task.owner,
    task_id: taskId,
    approved_by: userId,
    verdict: "rejected",
    note,
  });

  if (task.kind === "building_intake") {
    await supabase.from("tasks").update({ status: "rejected" }).eq("id", taskId);
    await supabase.from("events").insert({
      owner: task.owner,
      kind: "task_rejected",
      payload: note || "intake rejected",
      task_id: taskId,
    });
    return NextResponse.json({ ok: true });
  }

  await supabase.from("tasks").update({ status: "open", trigger_run_id: null }).eq("id", taskId);
  await supabase.from("events").insert({
    owner: task.owner,
    kind: "task_rejected",
    payload: note || "rejected — returned to queue",
    task_id: taskId,
  });

  // Re-draft with a fresh idempotency key so it actually re-runs instead of
  // deduping onto the run that was just rejected. A failed dispatch marks the
  // task failed rather than leaving it 'open' with no agent behind it.
  try {
    await dispatchTaskRun(taskId, { idempotencyKey: `draft-${taskId}-${Date.now()}` });
  } catch {
    await supabase.from("tasks").update({ status: "failed", trigger_run_id: null }).eq("id", taskId);
  }

  return NextResponse.json({ ok: true });
}

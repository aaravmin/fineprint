import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { createAdminSupabase } from "@/lib/supabase/admin";

// mark_done, as an HTTP route. The end of the line: a human confirms the
// approved filing actually went out. Only approved tasks can be filed. Replaces
// spacetimedb mark_done.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { data: task } = await supabase
    .from("tasks")
    .select("owner, status")
    .eq("id", taskId)
    .maybeSingle();

  if (!task || task.owner !== userId) {
    return NextResponse.json({ error: `task ${taskId} not found` }, { status: 404 });
  }
  if (task.status !== "approved") {
    return NextResponse.json(
      { error: `task ${taskId} is not approved — only approved work can be filed` },
      { status: 409 },
    );
  }

  await supabase.from("tasks").update({ status: "done" }).eq("id", taskId);
  await supabase.from("events").insert({
    owner: task.owner,
    kind: "task_done",
    payload: note || "filing confirmed",
    task_id: taskId,
  });

  return NextResponse.json({ ok: true });
}

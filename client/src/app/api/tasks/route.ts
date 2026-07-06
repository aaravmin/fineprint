import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { dispatchTaskRun } from "@/lib/jobs/dispatch";
import { createAdminSupabase } from "@/lib/supabase/admin";

// request_building, as an HTTP route. Insert an intake task under the caller,
// then fire the agent. Writes go through the service-role client (state-machine
// tables are read-only under RLS) with owner set from the verified Clerk id, so
// a client can never insert a task for another account. Replaces spacetimedb
// request_building.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (address === "") {
    return NextResponse.json({ error: "address cannot be empty" }, { status: 400 });
  }

  const supabase = createAdminSupabase();

  const deadline = new Date(Date.now() + 86_400_000).toISOString();
  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      owner: userId,
      law_id: "intake",
      kind: "building_intake",
      title: `Building intake — ${address}`,
      status: "open",
      deadline,
      intake_address: address,
    })
    .select("id")
    .single();

  if (error) {
    // The partial unique index (owner, intake_address) on live intakes makes the
    // "already in the queue" guard race-safe: a duplicate submit fails here.
    if (error.code === "23505") {
      return NextResponse.json({ error: `an intake for "${address}" is already in the queue` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message ?? "could not create the intake task" }, { status: 500 });
  }

  await supabase.from("events").insert({
    owner: userId,
    kind: "building_requested",
    payload: `intake queued for "${address}"`,
    task_id: task.id,
  });

  // Insert-then-trigger spans two systems. If the trigger fails, mark the task
  // failed rather than leaving an orphaned 'open' row with no agent behind it.
  try {
    const handle = await dispatchTaskRun(task.id, { idempotencyKey: `intake-${task.id}` });
    await supabase.from("tasks").update({ trigger_run_id: handle.id }).eq("id", task.id);
    return NextResponse.json({ taskId: task.id, runId: handle.id });
  } catch (err) {
    await supabase.from("tasks").update({ status: "failed", trigger_run_id: null }).eq("id", task.id);
    return NextResponse.json({ error: `could not start the agent: ${(err as Error).message}` }, { status: 502 });
  }
}

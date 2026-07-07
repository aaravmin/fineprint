import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { POST as createIntakeTask } from "../tasks/route";

// First-run onboarding: remember the address the owner signed up with, then queue
// the same intake the manual "request a building" flow queues. The task creation
// is not forked here - it delegates to the tasks route's POST so the dedupe
// guard, event, and agent dispatch stay in one place.
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
  const { error } = await supabase
    .from("settings")
    .upsert({ owner: userId, primary_address: address }, { onConflict: "owner" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const intakeRequest = new Request(new URL("/api/tasks", request.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const intakeResponse = await createIntakeTask(intakeRequest);

  if (!intakeResponse.ok) {
    return intakeResponse;
  }

  const intake = (await intakeResponse.json()) as Record<string, unknown>;
  return NextResponse.json({ ok: true, ...intake });
}

import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { createAdminSupabase } from "@/lib/supabase/admin";

// set_review_mode, as an HTTP route. One settings row per account; "auto"
// approves obligation drafts on submit, "manual" waits for a human (intakes
// always wait either way). Replaces spacetimedb set_review_mode.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const reviewMode = body.reviewMode;
  if (reviewMode !== "manual" && reviewMode !== "auto") {
    return NextResponse.json(
      { error: `review mode must be "manual" or "auto"` },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("settings")
    .upsert({ owner: userId, review_mode: reviewMode }, { onConflict: "owner" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("events").insert({
    owner: userId,
    kind: "review_mode_changed",
    payload:
      reviewMode === "auto"
        ? "auto — obligation drafts approve on submit; intakes still wait for a human"
        : "manual — every draft waits for a human",
  });

  return NextResponse.json({ ok: true });
}

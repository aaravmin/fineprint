import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { SUPABASE_TOKEN_TTL_SECONDS, signSupabaseToken } from "@/lib/supabase/token";

// The browser Supabase client fetches its access token here. We verify the Clerk
// session server-side (via the Clerk secret key — no Clerk dashboard config
// needed) and return a short-lived Supabase JWT scoped to that user. Signed-out
// callers get a 401, so their Supabase client stays anonymous and RLS returns
// nothing.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = await signSupabaseToken(userId);
  return NextResponse.json({ token, expiresIn: SUPABASE_TOKEN_TTL_SECONDS });
}

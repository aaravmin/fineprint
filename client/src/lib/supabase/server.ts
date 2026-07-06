import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { signSupabaseToken } from "./token";
import type { Database } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// RLS-scoped Supabase client for server components (route handlers use the admin
// client). It mints the same Clerk-derived Supabase token inline — no HTTP round
// trip — so reads run as the signed-in account under row-level security. A
// signed-out caller gets an anonymous client, which RLS returns nothing to.
export async function createServerSupabase(): Promise<SupabaseClient<Database>> {
  const { userId } = await auth();
  const token = userId ? await signSupabaseToken(userId) : null;

  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    accessToken: async () => token,
  });
}

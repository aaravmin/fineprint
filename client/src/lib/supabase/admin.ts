import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Service-role client. Bypasses RLS entirely — this is the privilege the old
// module gave registered workers ("workers see everything"). Only two callers
// need it: the approve route's ingest_building RPC (which writes rows on the
// task owner's behalf) and the Trigger.dev job (which writes any account's
// submissions/tasks). NEVER import this from client code or hand its key to the
// browser.
export function createAdminSupabase(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

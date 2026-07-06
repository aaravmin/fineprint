import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The job runs in Trigger.dev's cloud with the service_role key, so it bypasses
// RLS and can write any account's rows — the privilege the old module handed to
// registered workers. These env vars are set in the Trigger.dev dashboard, not
// in the repo's .env. Kept untyped here: the job touches only a few tables and
// the generated Database types live in the client workspace.
export function createJobSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the Trigger.dev environment",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

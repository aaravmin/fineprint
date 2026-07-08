// The fleet's database handle. Workers and scripts connect with the
// service-role key: it bypasses row-level security (the fleet sees every
// account's tasks, like the old worker visibility rules) and is the only
// role the fleet RPCs (register_worker, claim_task, submit_work, ...) accept.
// Humans never use this client — the dashboard connects with the anon key
// and a Clerk session.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types.ts";

// Rows are derived from the generated schema, so a renamed or dropped column
// fails to compile instead of surfacing as an undefined at runtime. Regenerate
// both copies (client + agents) with `npm run db:types` after a schema change.
export type TaskRow = Database["public"]["Tables"]["task"]["Row"];
export type BuildingRow = Database["public"]["Tables"]["building"]["Row"];

type FleetClient = SupabaseClient<Database>;
type RpcName = keyof Database["public"]["Functions"];

export function fleetClient(): FleetClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set — see .env.example",
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Every fleet mutation goes through an RPC; surface the database's error
// message (the functions throw in human language) instead of a bare object.
// The RPC name is schema-checked; params are built by each caller, so they
// cross the typed-rpc boundary untyped.
export async function callRpc<T = void>(
  client: FleetClient,
  fn: RpcName,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, args as never);
  if (error) {
    throw new Error(error.message);
  }
  return data as T;
}

// The fleet's database handle. Workers and scripts connect with the
// service-role key: it bypasses row-level security (the fleet sees every
// account's tasks, like the old worker visibility rules) and is the only
// role the fleet RPCs (register_worker, claim_task, submit_work, ...) accept.
// Humans never use this client — the dashboard connects with the anon key
// and a Clerk session.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface TaskRow {
  id: number;
  owner: string;
  building_id: number | null;
  law_id: string;
  kind: string;
  title: string;
  status: string;
  deadline: string;
  sla_breached: boolean;
  fine_estimate_usd: number | null;
  claimed_by: number | null;
  intake_address: string | null;
  created_at: string;
}

export interface BuildingRow {
  id: number;
  owner: string;
  address: string;
  bbl: string | null;
  bin: string | null;
  sqft: number;
  is_affordable: boolean;
  annual_emissions_tco2e: number | null;
  uses_json: string | null;
  ll97_covered: boolean | null;
  provenance_json: string | null;
  num_floors: number | null;
  units_residential: number | null;
  community_district: number | null;
  energy_star_score: number | null;
  compliance_plan_json: string | null;
  created_at: string;
}

export function fleetClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set — see .env.example",
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Every fleet mutation goes through an RPC; surface the database's error
// message (the functions throw in human language) instead of a bare object.
export async function callRpc<T = void>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    throw new Error(error.message);
  }
  return data as T;
}

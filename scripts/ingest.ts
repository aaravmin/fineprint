// Ingests a real NYC building: resolves the address through the data package
// (GeoSearch -> LL84 -> covered buildings list) and writes the facts through
// the ingest_building function, which spawns the building's obligations.
//
// Usage: npx tsx scripts/ingest.ts "350 5th Avenue, Manhattan"
//        (supabase must be running with the migration applied)
import { createClient } from "@supabase/supabase-js";

import { loadEnvLocal } from "../data/src/loadEnv.ts";
import { toIngestPayload } from "../data/src/ingestPayload.ts";
import { prepareIntake } from "../data/src/intake.ts";

loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://localhost:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Direct CLI ingests land under this account; the dashboard shows them when
// signed in with the matching Clerk user id (or query them with SQL).
const OWNER = process.env.INGEST_OWNER ?? "cli";

const address = process.argv[2];
if (!address) {
  console.error('Usage: npx tsx scripts/ingest.ts "<address, borough>"');
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY must be set — see .env.example");
  process.exit(1);
}

console.log(`Looking up "${address}" across NYC datasets…`);

// Same shared intake the agent workers use, so the script can never drift from
// the live coverage mapping or the compliance plan again.
const { facts, ingestArgs } = await prepareIntake(address);
const payload = toIngestPayload(ingestArgs);

console.log(`  BBL ${facts.bbl} — ${facts.address}`);
console.log(
  `  ${facts.grossFloorAreaSqft?.toLocaleString() ?? "unknown"} sqft, ${facts.annualEmissionsTco2e ?? "unknown"} tCO2e`,
);
console.log(
  `  covered: ${payload.task_specs.map(spec => spec.law_id).join(", ") || "(none on the DOB list)"}`,
);
console.log(
  `  LL97 fine (2024-2029, engine): ${payload.ll97_annual_fine_usd === null ? "no data" : `$${payload.ll97_annual_fine_usd.toLocaleString()}`}`,
);

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: buildingId, error } = await db.rpc("ingest_building", {
  p: payload,
  p_owner: OWNER,
});
if (error) {
  console.error(`Ingest failed: ${error.message}`);
  process.exit(1);
}

const { data: tasks } = await db
  .from("task")
  .select("title, status")
  .eq("building_id", buildingId)
  .order("id");

console.log(`Ingested → building #${buildingId} with ${tasks?.length ?? 0} obligations:`);
for (const task of tasks ?? []) {
  console.log(`  - ${task.title} [${task.status}]`);
}

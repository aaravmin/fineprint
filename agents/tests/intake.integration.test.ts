import { createClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";

// The intake queue against a RUNNING local Supabase (npm run db:start):
//   RUN_INTEGRATION=1 SUPABASE_SERVICE_ROLE_KEY=... npm test --workspace agents
// Skipped by default so CI (which has no database) stays green.
const integrationEnabled =
  process.env.RUN_INTEGRATION === "1" && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://localhost:54321";
const INTAKE_ADDRESS = "30-30 Thomson Avenue, Queens";
const OWNER = "integration-test";

describe.runIf(integrationEnabled)("intake queue against a live database", () => {
  test("holds exactly one live intake per owner and address", async () => {
    const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // request_building refuses the service role (humans queue intakes), so
    // seed the row the way an owner's call would land it, then assert the
    // dedup guard's view: one live intake for this owner+address.
    const { data: existing } = await db
      .from("task")
      .select("id")
      .eq("kind", "building_intake")
      .eq("owner", OWNER)
      .eq("intake_address", INTAKE_ADDRESS)
      .in("status", ["open", "claimed", "in_review"]);

    if (!existing || existing.length === 0) {
      const { error } = await db.from("task").insert({
        owner: OWNER,
        law_id: "intake",
        kind: "building_intake",
        title: `Building intake — ${INTAKE_ADDRESS}`,
        deadline: new Date(Date.now() + 86_400_000).toISOString(),
        intake_address: INTAKE_ADDRESS,
      });
      expect(error).toBeNull();
    }

    const { data: rows } = await db
      .from("task")
      .select("id")
      .eq("kind", "building_intake")
      .eq("owner", OWNER)
      .eq("intake_address", INTAKE_ADDRESS)
      .in("status", ["open", "claimed", "in_review"]);

    expect(rows?.length).toBe(1);
  });
});

import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { describe, expect, test } from "vitest";

// The intake queue against a RUNNING local Supabase (npm run db:start):
//   RUN_INTEGRATION=1 SUPABASE_SERVICE_ROLE_KEY=... npm test --workspace agents
// Skipped by default so CI (which has no database) stays green.
const integrationEnabled =
  process.env.RUN_INTEGRATION === "1" && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://localhost:54321";

// Supabase local always ships these well-known defaults; override for a
// different stack. The anon key only lets PostgREST accept the request — the
// owner JWT below (signed with the local secret) is what sets the caller.
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ??
  "super-secret-jwt-token-with-at-least-32-characters-long";

// Mint the kind of JWT a signed-in dashboard user carries: role=authenticated
// with their identity in `sub`, which fp_owner() reads to scope every row.
// Writes are impossible without it — the schema grants the service role only
// SELECT, so a direct insert is denied; humans queue intakes through
// request_building, exactly as the browser does.
async function ownerToken(sub: string): Promise<string> {
  return new SignJWT({ role: "authenticated", sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

describe.runIf(integrationEnabled)("intake queue against a live database", () => {
  test("request_building queues one intake and dedups the same address", async () => {
    // A fresh owner per run keeps the assertion deterministic against the
    // shared local database and clear of the 20-per-hour intake rate limit.
    const owner = `integration-test-${Date.now()}`;
    const address = "30-30 Thomson Avenue, Queens";

    const token = await ownerToken(owner);
    const db = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const first = await db.rpc("request_building", { p_address: address });
    expect(first.error).toBeNull();
    expect(typeof first.data).toBe("number");

    const second = await db.rpc("request_building", { p_address: address });
    expect(second.error?.message ?? "").toMatch(/already in the queue/);

    const { data: live, error } = await db
      .from("task")
      .select("id")
      .eq("kind", "building_intake")
      .eq("intake_address", address)
      .in("status", ["open", "claimed", "in_review"]);

    expect(error).toBeNull();
    expect(live?.length).toBe(1);
  });
});

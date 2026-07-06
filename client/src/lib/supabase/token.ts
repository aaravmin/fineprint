import "server-only";

import { SignJWT } from "jose";

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? "";

export const SUPABASE_TOKEN_TTL_SECONDS = 3_600;

// Mint a Supabase-accepted JWT for a signed-in Clerk user. It is signed with the
// project's JWT secret (HS256), so PostgREST and Realtime validate it natively —
// this is what lets us keep Clerk WITHOUT the Clerk<->Supabase dashboard
// integration. The `sub` claim carries the Clerk user id, which every RLS policy
// reads via auth.jwt()->>'sub'; `role: authenticated` is the claim RLS-scoped
// Realtime requires. Short-lived on purpose; the browser refreshes it hourly.
export async function signSupabaseToken(clerkUserId: string): Promise<string> {
  if (!JWT_SECRET) {
    throw new Error("SUPABASE_JWT_SECRET is not set");
  }

  const secret = new TextEncoder().encode(JWT_SECRET);

  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(clerkUserId)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(`${SUPABASE_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

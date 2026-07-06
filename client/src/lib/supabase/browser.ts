"use client";

import { useMemo } from "react";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Cache the minted token module-wide so we call /api/supabase-token about once
// an hour instead of on every Supabase request. Cleared on any failure (a
// sign-out returns 401), so a stale token never lingers.
let cached: { token: string; expiresAt: number } | null = null;

async function fetchSupabaseToken(): Promise<string | null> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) {
    return cached.token;
  }

  try {
    const response = await fetch("/api/supabase-token");
    if (!response.ok) {
      cached = null;
      return null;
    }

    const { token, expiresIn } = (await response.json()) as {
      token: string;
      expiresIn: number;
    };
    cached = { token, expiresAt: Date.now() + expiresIn * 1_000 };
    return token;
  } catch {
    cached = null;
    return null;
  }
}

// Browser Supabase client. Its access token is a short-lived Supabase JWT minted
// server-side from the Clerk session (see /api/supabase-token), signed with the
// project JWT secret — so no Clerk<->Supabase dashboard integration is needed.
// supabase-js reads `accessToken` for both REST and Realtime, so postgres_changes
// subscriptions are RLS-scoped to the signed-in account the same way queries are.
export function useSupabase(): SupabaseClient<Database> {
  return useMemo(
    () =>
      createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
        accessToken: fetchSupabaseToken,
      }),
    [],
  );
}

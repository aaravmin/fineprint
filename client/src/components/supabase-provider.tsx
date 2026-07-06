"use client";

import { createContext, type ReactNode, useContext } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { useSupabase } from "@/lib/supabase/browser";
import type { Database } from "@/lib/supabase/types";

// The Supabase counterpart to spacetime-provider.tsx. It holds one Clerk-
// authorized Supabase client for the subtree; data hooks read it and open
// Realtime channels. Which provider wraps the dashboard is chosen by
// NEXT_PUBLIC_DATA_BACKEND (see lib/data/backend.ts) during the parallel
// rollout — this one is not mounted until the flag flips to `supabase`.
const SupabaseContext = createContext<SupabaseClient<Database> | null>(null);

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const supabase = useSupabase();

  return <SupabaseContext.Provider value={supabase}>{children}</SupabaseContext.Provider>;
}

export function useSupabaseClient(): SupabaseClient<Database> {
  const client = useContext(SupabaseContext);
  if (!client) {
    throw new Error("useSupabaseClient must be used within <SupabaseProvider>");
  }
  return client;
}

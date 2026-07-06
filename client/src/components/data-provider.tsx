"use client";

import type { ReactNode } from "react";

import { SupabaseProvider } from "./supabase-provider";

// Mounts the Supabase client the Realtime data hooks read. (SpacetimeDB has been
// removed; this wrapper stays as the single data-provider seam.)
export function DataProvider({ children }: { children: ReactNode }) {
  return <SupabaseProvider>{children}</SupabaseProvider>;
}

"use client";

// Live reads and writes for the dashboard. DbProvider opens one Supabase
// client authenticated with the caller's Clerk session (RLS scopes every
// row to the signed-in account), keeps an in-memory snapshot of each table,
// and refreshes a table whenever Realtime reports a change on it. useTable
// and useReducer keep the call shape the components have always used.

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";

import { type ReducerToken, TABLE_NAMES, type TableName, type TableToken } from "./index";
import { mapRow } from "./mappers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const REFRESH_DEBOUNCE_MS = 150;

interface DbContextValue {
  // Null until Clerk resolves the session and the client is built. The context
  // is always present so children never crash for want of a provider; a null
  // client just means "not connected yet".
  client: SupabaseClient | null;
  snapshots: Partial<Record<TableName, unknown[]>>;
  loadedTables: Partial<Record<TableName, boolean>>;
}

const DbContext = createContext<DbContextValue | null>(null);

export function DbProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [snapshots, setSnapshots] = useState<Partial<Record<TableName, unknown[]>>>({});
  const [loadedTables, setLoadedTables] = useState<Partial<Record<TableName, boolean>>>({});
  const connectionLost = useRef(false);
  const everConnected = useRef(false);

  // One client per signed-in session. The accessToken callback hands every
  // PostgREST and Realtime request the current Clerk JWT, so `auth.jwt()`
  // inside the database is the Clerk user and RLS does the scoping.
  const client = useMemo(() => {
    if (!isLoaded || !isSignedIn) {
      return null;
    }
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      accessToken: async () => (await getToken()) ?? "",
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }, [isLoaded, isSignedIn, getToken]);

  const refreshTable = useCallback(async (db: SupabaseClient, table: TableName) => {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order(table === "settings" ? "owner" : "id", { ascending: true });

    if (error) {
      if (!connectionLost.current) {
        connectionLost.current = true;
        toast.error(
          everConnected.current
            ? "Lost the live board connection. Retrying."
            : "Can't reach the database. Live data is paused until it answers.",
        );
      }
      return;
    }

    if (connectionLost.current) {
      toast.success("Reconnected to the live board");
    }
    connectionLost.current = false;
    everConnected.current = true;

    const rows = (data ?? []).map((row) => mapRow(table, row as Record<string, unknown>));
    setSnapshots((previous) => ({ ...previous, [table]: rows }));
    setLoadedTables((previous) => ({ ...previous, [table]: true }));
  }, []);

  useEffect(() => {
    if (!client) {
      return;
    }

    for (const table of TABLE_NAMES) {
      void refreshTable(client, table);
    }

    // One channel, one binding per table. Any reported change refreshes that
    // table — refetching keeps RLS authoritative (delete events, for one,
    // don't carry enough to patch a filtered snapshot in place).
    const pending = new Map<TableName, ReturnType<typeof setTimeout>>();
    let channel = client.channel("fineprint-live");
    for (const table of TABLE_NAMES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        clearTimeout(pending.get(table));
        pending.set(
          table,
          setTimeout(() => void refreshTable(client, table), REFRESH_DEBOUNCE_MS),
        );
      });
    }
    channel.subscribe();

    return () => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      void client.removeChannel(channel);
    };
  }, [client, refreshTable]);

  // Always render the provider, even before Clerk resolves the session or if
  // the client never signs in. The dashboard layout renders live-data
  // components (the event toaster, the notifications bell) as our children, and
  // they call useTable during the layout's own render — with no context above
  // them that throws past the dashboard error boundary and white-screens every
  // page. A null client reads as empty tables and refuses writes; it is never a
  // missing provider.
  return <DbContext.Provider value={{ client, snapshots, loadedTables }}>{children}</DbContext.Provider>;
}

function useDb(): DbContextValue {
  const context = useContext(DbContext);
  if (!context) {
    throw new Error("useTable/useReducer need a signed-in DbProvider above them");
  }
  return context;
}

export function useTable<T>(token: TableToken<T>): [T[]] {
  const { snapshots } = useDb();
  return [(snapshots[token.name] ?? []) as T[]];
}

export function useTableLoaded<T>(token: TableToken<T>): boolean {
  const { loadedTables } = useDb();
  return loadedTables[token.name] === true;
}

export function useReducer<Args>(token: ReducerToken<Args>): (args: Args) => Promise<void> {
  const { client } = useDb();

  return useCallback(
    async (args: Args) => {
      if (!client) {
        throw new Error("Not connected to the database yet — try again in a moment.");
      }
      const params = await token.toParams(args, client);
      const { error } = await client.rpc(token.rpc, params);
      if (error) {
        throw new Error(error.message);
      }
    },
    [client, token],
  );
}

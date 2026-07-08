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

import type { Database } from "./database.types";
import { type ReducerToken, TABLE_NAMES, type TableName, type TableToken } from "./index";
import { mapRow } from "./mappers";

type Db = SupabaseClient<Database>;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const REFRESH_DEBOUNCE_MS = 150;

interface DbContextValue {
  client: Db;
  snapshots: Partial<Record<TableName, unknown[]>>;
  loadedTables: Partial<Record<TableName, boolean>>;
  connected: boolean;
}

const DbContext = createContext<DbContextValue | null>(null);

export function DbProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [snapshots, setSnapshots] = useState<Partial<Record<TableName, unknown[]>>>({});
  const [loadedTables, setLoadedTables] = useState<Partial<Record<TableName, boolean>>>({});
  const connectionLost = useRef(false);
  const everConnected = useRef(false);
  // A missable toast can't be the only signal that the database is unreachable:
  // an empty board would otherwise read as "no buildings / fully compliant".
  // This drives a persistent banner so an outage never looks like all-clear.
  const [connected, setConnected] = useState(true);

  // One client per signed-in session. The accessToken callback hands every
  // PostgREST and Realtime request the current Clerk JWT, so `auth.jwt()`
  // inside the database is the Clerk user and RLS does the scoping.
  const client = useMemo(() => {
    if (!isLoaded || !isSignedIn) {
      return null;
    }
    return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      accessToken: async () => (await getToken()) ?? "",
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }, [isLoaded, isSignedIn, getToken]);

  const refreshTable = useCallback(async (db: Db, table: TableName) => {
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
      setConnected(false);
      return;
    }

    if (connectionLost.current) {
      toast.success("Reconnected to the live board");
    }
    connectionLost.current = false;
    everConnected.current = true;
    setConnected(true);

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
    // Realtime failing silently would freeze the board on its first snapshot
    // with no symptom — surface it the same way a failed refresh does.
    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setConnected(false);
      }
    });

    return () => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      void client.removeChannel(channel);
    };
  }, [client, refreshTable]);

  // Signed-out pages (landing, sign-in) render without a connection — every
  // component that reads live data lives behind the dashboard's auth gate.
  // While a signed-in session is still building its client, render nothing:
  // dashboard components would otherwise mount without a provider and crash.
  if (!client) {
    if (!isLoaded) {
      return null;
    }
    return <>{children}</>;
  }

  return (
    <DbContext.Provider value={{ client, snapshots, loadedTables, connected }}>
      {!connected && <ConnectionLostBanner />}
      {children}
    </DbContext.Provider>
  );
}

// Persistent, unmissable outage signal. Shown whenever a live read or the
// Realtime channel reports the database is unreachable — the empty tables
// underneath must not be mistaken for "no obligations".
function ConnectionLostBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] bg-destructive px-4 py-2 text-center text-sm font-medium text-destructive-foreground shadow-sm"
    >
      Can&apos;t reach the live database — the board below may be stale or incomplete.
    </div>
  );
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
      const params = await token.toParams(args, client);
      // The RPC name is schema-checked; the params are assembled dynamically by
      // each descriptor, so they cross the typed-rpc boundary untyped.
      const { error } = await client.rpc(token.rpc, params as never);
      if (error) {
        throw new Error(error.message);
      }
    },
    [client, token],
  );
}

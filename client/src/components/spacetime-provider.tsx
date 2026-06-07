"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import type { Identity } from "spacetimedb";
import { SpacetimeDBProvider } from "spacetimedb/react";

import { DbConnection, type ErrorContext } from "@/module_bindings/index";

const HOST = process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ?? "ws://localhost:3011";
const DB_NAME = process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME ?? "fineprint";

// One toast per outage, not one per retry. Reset on reconnect so the next
// outage announces itself again.
let connectionLost = false;
let everConnected = false;

// The connection authenticates with the caller's Clerk session JWT, so the
// database identity derives from the Clerk user (iss+sub) — the same login
// is the same identity on any machine, and row-level security scopes what
// the subscription returns. No token is persisted client-side.
function buildConnection(token: string) {
  return DbConnection.builder()
    .withUri(HOST)
    .withDatabaseName(DB_NAME)
    .withToken(token)
    .onConnect((conn: DbConnection, _identity: Identity) => {
      conn.subscriptionBuilder().subscribeToAllTables();

      if (connectionLost) {
        toast.success("Reconnected to the live board");
      }
      connectionLost = false;
      everConnected = true;
    })
    .onConnectError((_ctx: ErrorContext, err: Error) => {
      console.error("SpacetimeDB connection error:", err.message);

      if (!connectionLost) {
        connectionLost = true;
        toast.error(
          everConnected
            ? "Lost the live board connection. Retrying."
            : "Can't reach the database. Live data is paused until it answers.",
        );
      }
    })
    .onDisconnect(() => {
      if (!connectionLost && everConnected) {
        connectionLost = true;
        scheduleReconnect();
      }
    });
}

// The SDK neither reconnects nor rejects reducer calls on a dead socket, so
// a dropped connection (module republish, server restart) silently eats
// every click. A reload rebuilds the connection AND picks up fresh bindings
// and a fresh Clerk token. The timestamp guard stops a reload loop while the
// server is actually down.
const LAST_RELOAD_KEY = "fineprint:last-auto-reload";
const RELOAD_LOOP_WINDOW_MS = 30_000;

function scheduleReconnect() {
  const lastReload = Number(sessionStorage.getItem(LAST_RELOAD_KEY) ?? 0);

  if (Date.now() - lastReload < RELOAD_LOOP_WINDOW_MS) {
    toast.error("Can't reach the database. Refresh once it's back.");
    return;
  }

  toast.error("Connection lost — reconnecting…");
  sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
  setTimeout(() => window.location.reload(), 1_200);
}

export function SpacetimeProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!isLoaded || !isSignedIn) {
      setToken(null);
      return;
    }

    getToken().then(sessionToken => {
      if (!cancelled) setToken(sessionToken);
    });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken]);

  const connectionBuilder = useMemo(
    () => (token ? buildConnection(token) : null),
    [token],
  );

  // Signed-out pages (landing, sign-in) render without a connection — every
  // component that reads live data lives behind the dashboard's auth gate.
  // While a signed-in session is still fetching its token, render nothing:
  // dashboard components would otherwise mount without a provider and crash.
  if (!connectionBuilder) {
    if (!isLoaded || isSignedIn) {
      return null;
    }
    return <>{children}</>;
  }

  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      {children}
    </SpacetimeDBProvider>
  );
}

"use client";

import type { ReactNode } from "react";

import { toast } from "sonner";
import type { Identity } from "spacetimedb";
import { SpacetimeDBProvider } from "spacetimedb/react";

import { DbConnection, type ErrorContext } from "@/module_bindings/index";

const HOST = process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ?? "ws://localhost:3011";
const DB_NAME = process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME ?? "fineprint";
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

// One toast per outage, not one per retry. Reset on reconnect so the next
// outage announces itself again.
let connectionLost = false;
let everConnected = false;

function getToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem(TOKEN_KEY) ?? undefined;
}

const connectionBuilder = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .withToken(getToken())
  .onConnect((conn: DbConnection, _identity: Identity, token: string) => {
    if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, token);
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

// The SDK neither reconnects nor rejects reducer calls on a dead socket, so
// a dropped connection (module republish, server restart) silently eats
// every click. A reload rebuilds the connection AND picks up fresh bindings.
// The timestamp guard stops a reload loop while the server is actually down.
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
  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      {children}
    </SpacetimeDBProvider>
  );
}

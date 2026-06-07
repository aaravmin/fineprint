"use client";

import type { ReactNode } from "react";
import { Identity } from "spacetimedb";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection, type ErrorContext } from "@/module_bindings/index";

const HOST = process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ?? "ws://localhost:3011";
const DB_NAME = process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME ?? "fineprint";
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

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
  })
  .onConnectError((_ctx: ErrorContext, err: Error) => {
    console.error("SpacetimeDB connection error:", err.message);
  });

export function SpacetimeProvider({ children }: { children: ReactNode }) {
  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      {children}
    </SpacetimeDBProvider>
  );
}

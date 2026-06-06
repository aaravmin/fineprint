import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Identity } from "spacetimedb";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection, type ErrorContext } from "./module_bindings/index.ts";
import App from "./App.tsx";
import "./index.css";

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? "ws://localhost:3000";
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? "fineprint";
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

const connectionBuilder = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .withToken(localStorage.getItem(TOKEN_KEY) || undefined)
  .onConnect((_conn: DbConnection, identity: Identity, token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    console.log("Connected as", identity.toHexString());
  })
  .onConnectError((_ctx: ErrorContext, err: Error) => {
    console.error("SpacetimeDB connection error:", err);
  });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App />
    </SpacetimeDBProvider>
  </StrictMode>,
);

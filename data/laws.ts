// Canonical registry lives inside the module (the module cannot import outside
// its own src/). This re-export exists for scripts and future client use.
export * from "../spacetimedb/src/laws";

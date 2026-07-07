// Workspace package wrapper so the client (and any Vercel-isolated build)
// resolves the canonical law registry as a real dependency instead of a
// fragile relative path. The registry itself lives in data/src/laws.ts.
export * from "../data/src/laws.ts";

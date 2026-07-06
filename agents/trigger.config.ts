import { defineConfig } from "@trigger.dev/sdk";
import { additionalFiles } from "@trigger.dev/build/extensions/core";

// Trigger.dev project configuration. The project ref comes from the Trigger.dev
// dashboard (Project settings -> "proj_..."); set TRIGGER_PROJECT_REF in your
// shell for `npx trigger.dev@latest dev` / `deploy`, or replace the fallback
// with the literal ref. The job's own secrets (SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, SOCRATA_APP_TOKEN) are set in
// the Trigger.dev dashboard under Environment Variables, not here.
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_REPLACE_ME",
  dirs: ["./src/trigger"],
  // Intake hits several NYC datasets in sequence; give the run room.
  maxDuration: 300,
  // The intake pipeline reads local data assets at runtime (data/src/
  // coveredBuildings.ts loads ../cbl/cbl26.json.gz; the ll97 corpus backs the
  // advise tool). esbuild does not bundle readFileSync assets, so without this
  // every DEPLOYED intake would throw ENOENT after geocoding and land as a
  // failure report - while `trigger dev` passes on the local filesystem. After
  // the first deploy, confirm intake resolves a real building; if it returns
  // ENOENT reports, the copied asset is not where import.meta.url resolves and
  // these globs need adjusting.
  build: {
    extensions: [
      additionalFiles({ files: ["../data/cbl/**", "../data/corpus/**"] }),
    ],
  },
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      factor: 1.8,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 30_000,
      randomize: true,
    },
  },
});

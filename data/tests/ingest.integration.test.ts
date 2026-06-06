import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

// End-to-end ingest against a RUNNING local SpacetimeDB:
//   RUN_INTEGRATION=1 npm test --workspace data
// Skipped by default so CI (which has no server) stays green. Uses the
// local dev database; ingest is idempotent, so re-runs only refresh rows.
const integrationEnabled = process.env.RUN_INTEGRATION === "1";
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function runIngest(address: string): string {
  return execFileSync("npx", ["tsx", "scripts/ingest.ts", address], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60_000,
  });
}

describe.runIf(integrationEnabled)("ingest.ts against a live server", () => {
  test("ingests a real building and spawns its obligations", () => {
    const output = runIngest("30-30 Thomson Avenue, Queens");

    expect(output).toMatch(/BBL 4002770001/);
    expect(output).toMatch(/Ingested → building #\d+ with \d+ obligations/);
    expect(output).toMatch(/LL97 — Building Emissions Cap/);
  });

  test("re-ingesting the same building does not duplicate obligations", () => {
    const firstRun = runIngest("30-30 Thomson Avenue, Queens");
    const secondRun = runIngest("30-30 Thomson Avenue, Queens");

    const obligationCount = (output: string) =>
      Number(output.match(/with (\d+) obligations/)?.[1]);

    expect(obligationCount(secondRun)).toBe(obligationCount(firstRun));
  });
});

describe.runIf(!integrationEnabled)("ingest.ts integration (skipped)", () => {
  test.skip("set RUN_INTEGRATION=1 with a running spacetime server to enable", () => {});
});

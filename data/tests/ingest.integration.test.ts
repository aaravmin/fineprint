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

  // The reported bug: a small building resolved to zero floor area (PLUTO was
  // ignored) and collapsed to LL152 alone, while large buildings silently
  // dropped LL11. These two real-data buildings pin both ends of the fix.
  test("a sub-25k building's only sustainability obligation is LL152", () => {
    const output = runIngest("32 West 32 Street, Manhattan");

    expect(output).toMatch(/with 1 obligations/);
    expect(output).toMatch(/LL152 — Gas Piping Inspection & Certification/);
    expect(output).not.toMatch(/LL97 — Building Emissions Cap/);
    expect(output).not.toMatch(/LL84 — Energy & Water Benchmarking/);
  });

  test("a large building gets the full size-based law set, LL11 included", () => {
    const output = runIngest("350 5th Avenue, Manhattan");

    for (const title of [
      /LL97 — Building Emissions Cap/,
      /LL84 — Energy & Water Benchmarking/,
      /LL87 — Energy Audit & Retro-commissioning/,
      /LL11 \/ FISP — Facade Inspection/,
      /LL88 — Lighting Upgrades & Submetering/,
      /LL152 — Gas Piping Inspection & Certification/,
    ]) {
      expect(output).toMatch(title);
    }
  });
});

describe.runIf(!integrationEnabled)("ingest.ts integration (skipped)", () => {
  test.skip("set RUN_INTEGRATION=1 with a running spacetime server to enable", () => {});
});

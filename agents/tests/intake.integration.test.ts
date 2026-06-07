import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

// request_building against a RUNNING local SpacetimeDB:
//   RUN_INTEGRATION=1 npm test --workspace agents
// Skipped by default so CI (which has no server) stays green.
const integrationEnabled = process.env.RUN_INTEGRATION === "1";

const INTAKE_ADDRESS = "30-30 Thomson Avenue, Queens";

function spacetime(...args: string[]): string {
  return execFileSync("spacetime", args, { encoding: "utf8", timeout: 30_000 });
}

describe.runIf(integrationEnabled)("request_building against a live server", () => {
  test("queues an intake task exactly once per address", () => {
    let firstCallError = "";
    try {
      spacetime(
        "call",
        "-s",
        "local",
        "fineprint",
        "request_building",
        `"${INTAKE_ADDRESS}"`,
      );
    } catch (error) {
      firstCallError = String((error as { stderr?: string }).stderr ?? error);
    }

    // Either the call queued a fresh intake, or one was already waiting from
    // a previous run — both mean the reducer and its dedupe guard work.
    if (firstCallError) {
      expect(firstCallError).toMatch(/already in the queue/);
    }

    const rows = spacetime(
      "sql",
      "-s",
      "local",
      "fineprint",
      `SELECT kind, intakeAddress FROM task WHERE kind = 'building_intake'`,
    );
    expect(rows).toContain(INTAKE_ADDRESS);

    // A second request for the same address must always be rejected.
    expect(() =>
      spacetime(
        "call",
        "-s",
        "local",
        "fineprint",
        "request_building",
        `"${INTAKE_ADDRESS}"`,
      ),
    ).toThrow();
  });
});

describe.runIf(!integrationEnabled)("request_building integration (skipped)", () => {
  test.skip("set RUN_INTEGRATION=1 with a running spacetime server to enable", () => {});
});

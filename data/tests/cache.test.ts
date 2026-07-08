import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cacheRead, cacheReadEntry, cacheWrite } from "../src/cache.ts";
import { cachedFetchJson, type StaleSnapshot } from "../src/http.ts";

let cacheDir: string;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "fineprint-cache-"));
  process.env.FINEPRINT_CACHE_DIR = cacheDir;
});

afterEach(() => {
  delete process.env.FINEPRINT_CACHE_DIR;
  rmSync(cacheDir, { recursive: true, force: true });
});

describe("snapshot cache", () => {
  test("a written value reads back", () => {
    cacheWrite("LL84", "https://example.test/a", { rows: [1, 2] });

    expect(cacheRead("LL84", "https://example.test/a")).toEqual({ rows: [1, 2] });
  });

  test("a missing key reads null", () => {
    expect(cacheRead("LL84", "https://example.test/missing")).toBeNull();
  });

  test("the Socrata app token never lands in the cache key", () => {
    cacheWrite("LL84", "https://example.test/a?$$app_token=SECRET&bbl=1", { ok: 1 });

    expect(cacheRead("LL84", "https://example.test/a?bbl=1")).toEqual({ ok: 1 });
  });
});

describe("cachedFetchJson", () => {
  test("live data is returned and snapshotted", async () => {
    const live = { fresh: true };
    const result = await cachedFetchJson(
      "https://example.test/live",
      { service: "Test" },
      async () => live,
    );

    expect(result).toEqual(live);
    expect(cacheRead("Test", "https://example.test/live")).toEqual(live);
  });

  test("a dead fetch falls back to the snapshot", async () => {
    cacheWrite("Test", "https://example.test/down", { stale: true });

    const result = await cachedFetchJson(
      "https://example.test/down",
      { service: "Test" },
      async () => {
        throw new Error("network is down");
      },
    );

    expect(result).toEqual({ stale: true });
  });

  test("a snapshot fallback reports the snapshot's date to onStale", async () => {
    cacheWrite("Test", "https://example.test/stale", { stale: true });
    const recordedAt = cacheReadEntry("Test", "https://example.test/stale")?.recordedAt;

    const staleReports: StaleSnapshot[] = [];
    await cachedFetchJson(
      "https://example.test/stale",
      { service: "Test", onStale: info => staleReports.push(info) },
      async () => {
        throw new Error("network is down");
      },
    );

    expect(staleReports).toEqual([{ service: "Test", recordedAt }]);
  });

  test("a live fetch never reports staleness", async () => {
    const staleReports: StaleSnapshot[] = [];
    await cachedFetchJson(
      "https://example.test/live2",
      { service: "Test", onStale: info => staleReports.push(info) },
      async () => ({ fresh: true }),
    );

    expect(staleReports).toEqual([]);
  });

  test("no snapshot means the live error surfaces", async () => {
    await expect(
      cachedFetchJson("https://example.test/never", { service: "Test" }, async () => {
        throw new Error("network is down");
      }),
    ).rejects.toThrow(/network is down/);
  });
});

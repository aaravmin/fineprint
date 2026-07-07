// Snapshot cache for live API responses, so the demo survives dead wifi:
// every successful fetch leaves a snapshot under data/cache/<service>/, and
// a failed fetch falls back to the snapshot when one exists. Keys are URLs
// with any Socrata app token stripped — secrets never reach disk.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "cache");

interface Snapshot {
  key: string;
  recordedAt: string;
  value: unknown;
}

export function cacheRead<T>(service: string, key: string): T | null {
  try {
    const raw = readFileSync(snapshotPath(service, key), "utf8");
    return (JSON.parse(raw) as Snapshot).value as T;
  } catch {
    return null;
  }
}

export function cacheWrite(service: string, key: string, value: unknown): void {
  const path = snapshotPath(service, key);
  mkdirSync(dirname(path), { recursive: true });

  const snapshot: Snapshot = {
    key: stripToken(key),
    recordedAt: new Date().toISOString(),
    value,
  };
  writeFileSync(path, JSON.stringify(snapshot, null, 2));
}

function snapshotPath(service: string, key: string): string {
  const root = process.env.FINEPRINT_CACHE_DIR ?? DEFAULT_ROOT;
  const digest = createHash("sha1").update(stripToken(key)).digest("hex").slice(0, 16);
  return join(root, service.toLowerCase().replace(/[^a-z0-9]+/g, "-"), `${digest}.json`);
}

// The token parameter appears literally ($$app_token=) when the URL was
// concatenated by hand and percent-encoded (%24%24app_token=) when it went
// through URLSearchParams — strip both, or the secret lands on disk.
export function stripToken(key: string): string {
  return key
    .replace(/[?&](?:\$\$|%24%24)app_token=[^&]*/gi, "")
    .replace(/^([^?]*)&/, "$1?");
}

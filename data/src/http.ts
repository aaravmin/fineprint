// Shared fetch helper: one place for timeouts, JSON parsing, and errors that
// say which service failed and why. Every API client goes through this.

import { cacheReadEntry, cacheWrite, stripToken } from "./cache.ts";

// What cachedFetchJson reports when a live fetch fails and it falls back to a
// snapshot. recordedAt is the snapshot's own timestamp, so a caller can tell a
// human how old the served data actually is.
export interface StaleSnapshot {
  service: string;
  recordedAt: string;
}

export interface FetchJsonOptions {
  service: string; // human name for error messages ("GeoSearch", "LL84")
  timeoutMs?: number;
  headers?: Record<string, string>; // e.g. Socrata's X-App-Token
  // Fires only when a live fetch fails and a cached snapshot is served in its
  // place, so the staleness can reach provenance instead of dying in a warning.
  onStale?: (info: StaleSnapshot) => void;
}

// Live-then-cache: a good response leaves a snapshot, a dead network serves
// the last snapshot with a warning, and a never-seen URL fails loudly. The
// fetcher is injectable so tests run offline.
export async function cachedFetchJson<T>(
  url: string,
  options: FetchJsonOptions,
  fetcher: (url: string, options: FetchJsonOptions) => Promise<T> = fetchJson,
): Promise<T> {
  try {
    const fresh = await fetcher(url, options);
    cacheWrite(options.service, url, fresh);
    return fresh;
  } catch (liveError) {
    const snapshot = cacheReadEntry<T>(options.service, url);
    if (snapshot !== null) {
      console.warn(
        `[${options.service}] live fetch failed (${(liveError as Error).message}); serving snapshot from ${snapshot.recordedAt}`,
      );
      options.onStale?.({ service: options.service, recordedAt: snapshot.recordedAt });
      return snapshot.value;
    }
    throw liveError;
  }
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions): Promise<T> {
  const { service, timeoutMs = 10_000, headers } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new Error(`${service} request failed: ${(cause as Error).message}`, { cause });
  }

  if (!response.ok) {
    throw new Error(
      `${service} responded ${response.status} ${response.statusText} for ${stripToken(url)}`,
    );
  }

  return (await response.json()) as T;
}

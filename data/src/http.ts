// Shared fetch helper: one place for timeouts, JSON parsing, and errors that
// say which service failed and why. Every API client goes through this.

import { cacheRead, cacheWrite, stripToken } from "./cache.ts";

export interface FetchJsonOptions {
  service: string; // human name for error messages ("GeoSearch", "LL84")
  timeoutMs?: number;
  headers?: Record<string, string>; // e.g. Socrata's X-App-Token
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
    const snapshot = cacheRead<T>(options.service, url);
    if (snapshot !== null) {
      console.warn(
        `[${options.service}] live fetch failed (${(liveError as Error).message}); serving cached snapshot`,
      );
      return snapshot;
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

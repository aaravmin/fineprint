// Shared fetch helper: one place for timeouts, JSON parsing, and errors that
// say which service failed and why. Every API client goes through this.

import { cacheRead, cacheWrite } from "./cache.ts";

export interface FetchJsonOptions {
  service: string; // human name for error messages ("GeoSearch", "Benchmarking")
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

// Backoff between retries, in milliseconds. The length is also the retry
// budget: two entries means one live attempt plus two retries. NYC Open Data
// throttles bursts with 429s, so a short pause clears most transient failures.
const RETRY_DELAYS_MS = [250, 1_000];

export async function fetchJson<T>(url: string, options: FetchJsonOptions): Promise<T> {
  const { service, timeoutMs = 10_000, headers } = options;

  let lastError = new Error(`${service} request failed`);

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const isLastAttempt = attempt === RETRY_DELAYS_MS.length;

    let response: Response;
    try {
      response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      // A thrown fetch is a network fault or a timeout - always worth a retry.
      lastError = new Error(`${service} request failed: ${(cause as Error).message}`, {
        cause,
      });
      if (isLastAttempt) {
        throw lastError;
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    lastError = new Error(
      `${service} responded ${response.status} ${response.statusText} for ${url}`,
    );

    // Only rate limits and server faults are worth retrying; a 400 or 404 will
    // answer the same way next time, so surface it immediately.
    const isRetryable = response.status === 429 || response.status >= 500;
    if (isLastAttempt || !isRetryable) {
      throw lastError;
    }
    await sleep(retryAfterMs(response) ?? RETRY_DELAYS_MS[attempt]);
  }

  throw lastError;
}

// Honor a Retry-After header when it names a sane number of seconds, capped at
// 5s so a hostile or misconfigured header can never stall the whole pipeline.
// Returns null for an absent, non-numeric (HTTP-date), or negative value, and
// the caller falls back to the fixed backoff.
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (header === null) {
    return null;
  }

  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  return Math.min(seconds, 5) * 1_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

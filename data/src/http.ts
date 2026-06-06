// Shared fetch helper: one place for timeouts, JSON parsing, and errors that
// say which service failed and why. Every API client goes through this.

export interface FetchJsonOptions {
  service: string; // human name for error messages ("GeoSearch", "LL84")
  timeoutMs?: number;
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions): Promise<T> {
  const { service, timeoutMs = 10_000 } = options;

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (cause) {
    throw new Error(`${service} request failed: ${(cause as Error).message}`, { cause });
  }

  if (!response.ok) {
    throw new Error(
      `${service} responded ${response.status} ${response.statusText} for ${url}`,
    );
  }

  return (await response.json()) as T;
}

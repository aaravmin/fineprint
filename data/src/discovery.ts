import { fetchJson } from "./http.ts";

const CATALOG_API = "https://api.us.socrata.com/api/catalog/v1";

const cache = new Map<string, string | null>();

export async function resolveDatasetId(
  query: string,
  domain = "data.cityofnewyork.us",
): Promise<string | null> {
  const cacheKey = `${domain}::${query}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const url = `${CATALOG_API}?domains=${encodeURIComponent(domain)}&q=${encodeURIComponent(query)}&only=resource`;
  try {
    const resp = await fetchJson<{
      results?: Array<{ resource: { id: string; name?: string } }>;
    }>(url, {
      service: "Socrata Catalog",
    });
    const first = resp.results && resp.results[0];
    const id = first?.resource?.id ?? null;
    cache.set(cacheKey, id);
    return id;
  } catch (e) {
    cache.set(cacheKey, null);
    return null;
  }
}

export function resourceUrlFor(domain: string, resourceId: string): string {
  return `https://${domain}/resource/${resourceId}.json`;
}

export async function resolveResourceUrl(
  query: string,
  domain = "data.cityofnewyork.us",
): Promise<string | null> {
  const id = await resolveDatasetId(query, domain);
  if (!id) return null;
  return resourceUrlFor(domain, id);
}

export default { resolveDatasetId, resolveResourceUrl };

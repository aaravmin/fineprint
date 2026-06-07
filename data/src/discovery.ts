import { fetchJson } from "./http.ts";

const DISCOVERY_URL = "https://api.us.socrata.com/api/catalog/v1";

const KNOWN_DATASET_IDS: Record<string, string> = {
  "dob now safety boiler": "52dp-yji6",
  "dob now: safety boiler": "52dp-yji6",
  "dob now build job filings": "w9ak-ipjd",
  "dob now: build job filings": "w9ak-ipjd",
  "dob job application filings": "ic3t-wcy2",
  "dob ecb violations": "6bgk-3dad",
};

interface CatalogResult {
  resource: {
    id: string;
  };
}

interface CatalogResponse {
  results: CatalogResult[];
}

export async function resolveDatasetId(
  query: string,
  domain = "data.cityofnewyork.us",
): Promise<string> {
  const normalized = query.trim().toLowerCase();

  if (/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(query)) {
    return query;
  }

  const known = KNOWN_DATASET_IDS[normalized];
  if (known) {
    return known;
  }

  const url = `${DISCOVERY_URL}?domains=${encodeURIComponent(domain)}&q=${encodeURIComponent(
    query,
  )}&limit=10`;
  const response = await fetchJson<CatalogResponse>(url, {
    service: "Socrata Discovery",
  });

  const candidate = response.results[0];
  if (!candidate) {
    throw new Error(`no Socrata dataset found for "${query}"`);
  }

  return candidate.resource.id;
}

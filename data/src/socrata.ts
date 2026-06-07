// Socrata (NYC Open Data) access: stable dataset ids, resource URLs, the
// app-token header, and a paged row fetcher. Rotating four-by-fours are
// resolved at runtime through discovery.ts; the ids below are the ones DOB
// keeps stable, which the build spec allows us to hardcode.

import { fetchJson } from "./http.ts";

const SOCRATA_DOMAIN = "data.cityofnewyork.us";

export const DATASET = {
  dobNowSafetyBoiler: "52dp-yji6", // BIN-keyed (bin_number)
  dobNowBuildJobFilings: "w9ak-ipjd", // BIN and BBL keyed
  dobJobApplicationsLegacy: "ic3t-wcy2",
  ecbViolations: "6bgk-3dad", // BIN-keyed
} as const;

export function resourceUrl(datasetId: string, domain = SOCRATA_DOMAIN): string {
  return `https://${domain}/resource/${datasetId}.json`;
}

// The app token raises Socrata's per-IP rate limit. Sent as a header per the
// build spec; absent in local dev, where the throttled anonymous tier is fine.
function appTokenHeaders(): Record<string, string> {
  const token = globalThis.process?.env?.SOCRATA_APP_TOKEN;
  return token ? { "X-App-Token": token } : {};
}

// Fetch every row matching a SoQL filter, paging until the dataset runs out.
// `where` holds equality filters (e.g. { bin_number: "1015862" }); the page
// size is Socrata SODA 2.0's maximum, so most buildings come back in one trip.
export async function fetchAllRows<Row>(
  datasetId: string,
  where: Record<string, string>,
  service: string,
): Promise<Row[]> {
  const url = resourceUrl(datasetId);
  const pageSize = 50_000;
  let offset = 0;
  const rows: Row[] = [];

  while (true) {
    const query = new URLSearchParams({
      ...where,
      $limit: String(pageSize),
      $offset: String(offset),
    });

    const page = await fetchJson<Row[]>(`${url}?${query}`, {
      service,
      headers: appTokenHeaders(),
    });

    if (!page || page.length === 0) {
      break;
    }
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return rows;
}

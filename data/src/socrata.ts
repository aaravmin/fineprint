// Socrata (NYC Open Data) access: stable dataset ids, resource URLs, the
// app-token header, and a paged row fetcher. Rotating four-by-fours are
// resolved at runtime through discovery.ts; the ids below are the ones DOB
// keeps stable, which the build spec allows us to hardcode.

import { cachedFetchJson, fetchJson, type FetchJsonOptions } from "./http.ts";

const SOCRATA_DOMAIN = "data.cityofnewyork.us";

export const DATASET = {
  dobNowSafetyBoiler: "52dp-yji6", // BIN-keyed (bin_number)
  dobNowBuildJobFilings: "w9ak-ipjd", // BIN and BBL keyed
  dobJobApplicationsLegacy: "ic3t-wcy2", // BIS job applications, BIN-keyed (bin__)
  ecbViolations: "6bgk-3dad", // BIN-keyed
  dobNowSafetyFacades: "xubg-57si", // BIN-keyed; FISP compliance filings
  dobPermitIssuance: "ipu4-2q9a", // BIS permits back to ~1989, BIN-keyed (bin__)
  dobViolations: "3h2n-5cm9", // BIN-keyed (bin column, sparse on orphan rows)
  hpdViolations: "wvxf-dwi5", // BIN-keyed (bin now populated), housing code
  hpdComplaints: "ygpa-z7cr", // BBL-keyed; complaints and their problems
  depCatsPermits: "f4rp-2kvy", // BIN-keyed; boiler/burner fuel registrations
  dobNowElevator: "e5aq-a4j2", // BIN-keyed; elevator device compliance
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

// Fetch every row matching a SoQL query, paging until the dataset runs out.
// `query` holds equality filters (e.g. { bin_number: "1015862" }) and may also
// carry SoQL clauses like $where (a date floor) and $order; $limit and $offset
// belong to paging and are set here. The page size is Socrata SODA 2.0's
// maximum, so most buildings come back in one trip.
//
// Each page goes through cachedFetchJson, so a live fetch leaves a disk
// snapshot and a dead network serves the last snapshot per page URL, the same
// resilience ll84 and geosearch already have. The fetcher stays injectable so
// tests can run without touching the network.
export async function fetchAllRows<Row>(
  datasetId: string,
  query: Record<string, string>,
  service: string,
  fetcher: (url: string, options: FetchJsonOptions) => Promise<Row[]> = fetchJson,
): Promise<Row[]> {
  const url = resourceUrl(datasetId);
  const pageSize = 50_000;
  let offset = 0;
  const rows: Row[] = [];

  while (true) {
    const params = new URLSearchParams({
      ...query,
      $limit: String(pageSize),
      $offset: String(offset),
    });

    const page = await cachedFetchJson<Row[]>(
      `${url}?${params}`,
      { service, headers: appTokenHeaders() },
      fetcher,
    );

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

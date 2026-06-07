import { resolveDatasetId } from "./discovery.ts";
import { fetchJson } from "./http.ts";
import type { BoilerRecord } from "./types.ts";

const BOILER_DATASET_NAME = "DOB NOW Safety Boiler";

export async function fetchBoilerRecordsByBin(bin: string): Promise<BoilerRecord[]> {
  const datasetId = await resolveDatasetId(BOILER_DATASET_NAME);
  const params = new URLSearchParams({ bin, $limit: "1000" });
  const url = `https://data.cityofnewyork.us/resource/${datasetId}.json?${params}`;
  return fetchJson<BoilerRecord[]>(url, { service: BOILER_DATASET_NAME });
}

import { resolveDatasetId } from "./discovery.ts";
import { fetchJson } from "./http.ts";
import type { BuildJobFiling, LegacyJobFiling } from "./types.ts";

const BUILD_JOB_FILINGS_DATASET_NAME = "DOB NOW Build Job Filings";
const LEGACY_JOB_FILINGS_DATASET_NAME = "DOB Job Application Filings";

export async function fetchBuildJobFilingsByBin(bin: string): Promise<BuildJobFiling[]> {
  const datasetId = await resolveDatasetId(BUILD_JOB_FILINGS_DATASET_NAME);
  const params = new URLSearchParams({ bin, $limit: "1000" });
  const url = `https://data.cityofnewyork.us/resource/${datasetId}.json?${params}`;
  return fetchJson<BuildJobFiling[]>(url, { service: BUILD_JOB_FILINGS_DATASET_NAME });
}

export async function fetchLegacyJobFilingsByBin(bin: string): Promise<LegacyJobFiling[]> {
  const datasetId = await resolveDatasetId(LEGACY_JOB_FILINGS_DATASET_NAME);
  const params = new URLSearchParams({ bin, $limit: "1000" });
  const url = `https://data.cityofnewyork.us/resource/${datasetId}.json?${params}`;
  return fetchJson<LegacyJobFiling[]>(url, { service: LEGACY_JOB_FILINGS_DATASET_NAME });
}

// HPD complaints and their problems (Socrata ygpa-z7cr), keyed by bbl. This is
// the merged dataset that replaced the two older HPD complaint feeds; it
// carries both bbl and bin, and we key by bbl because a complaint is filed
// against the tax lot. Each row is one problem within a complaint, so a single
// heating outage can produce many rows - exactly the density we want to read.
// Floored at ten years and ordered newest-first for the same reason as
// hpdViolations.

import type { Bbl, HpdComplaintProblem } from "./types.ts";
import { DATASET, fetchAllRows } from "./socrata.ts";
import { isoYearsAgo } from "./recordWindow.ts";

interface HpdComplaintRow {
  complaint_id?: string;
  problem_id?: string;
  bbl?: string;
  bin?: string;
  major_category?: string;
  minor_category?: string;
  problem_code?: string;
  complaint_status?: string;
  problem_status?: string;
  status_description?: string;
  received_date?: string;
  [k: string]: string | undefined;
}

export async function fetchHpdComplaintsByBbl(bbl: Bbl): Promise<HpdComplaintProblem[]> {
  const rows = await fetchAllRows<HpdComplaintRow>(
    DATASET.hpdComplaints,
    {
      bbl,
      $where: `received_date > '${isoYearsAgo(10)}'`,
      $order: "received_date DESC",
    },
    "HPD Complaints",
  );

  return parseHpdComplaintRows(rows);
}

export function parseHpdComplaintRows(rows: HpdComplaintRow[]): HpdComplaintProblem[] {
  return rows.map(row => ({
    complaintId: row.complaint_id ?? "",
    problemId: row.problem_id ?? null,
    bbl: row.bbl ?? null,
    bin: row.bin ?? null,
    majorCategory: row.major_category ?? null,
    minorCategory: row.minor_category ?? null,
    problemCode: row.problem_code ?? null,
    complaintStatus: row.complaint_status ?? null,
    problemStatus: row.problem_status ?? null,
    statusDescription: row.status_description ?? null,
    receivedDate: row.received_date ?? null,
    raw: row as Record<string, unknown>,
  }));
}

export default fetchHpdComplaintsByBbl;

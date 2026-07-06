// One place that understands every date shape the NYC datasets file in. Phase 1
// kept each source's dates exactly as filed - BIS permits and job filings write
// MM/DD/YYYY, DOB violations write YYYYMMDD, and the HPD, CATS, and elevator
// feeds write ISO timestamps - so the fetchers stay faithful mirrors of the
// record. The systems inference needs a comparable year and a clean ISO date out
// of any of them; that normalization lives here rather than in the fetchers.

export interface RecordDate {
  // Four-digit calendar year, or null when the string is missing or unparseable.
  year: number | null;
  // The date as YYYY-MM-DD, or null when it could not be parsed.
  iso: string | null;
}

const EMPTY: RecordDate = { year: null, iso: null };

export function parseRecordDate(value: string | null | undefined): RecordDate {
  if (value === undefined || value === null) {
    return EMPTY;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return EMPTY;
  }

  // ISO timestamp ("2026-02-27T00:00:00.000") or plain ISO date. The leading
  // YYYY-MM-DD is all the inference needs; the time and zone are dropped.
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return { year: Number(iso[1]), iso: `${iso[1]}-${iso[2]}-${iso[3]}` };
  }

  // MM/DD/YYYY, the BIS permit and job-filing shape. Day and month may be a
  // single digit, so both are zero-padded on the way into an ISO string.
  const usDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDate) {
    const month = usDate[1].padStart(2, "0");
    const day = usDate[2].padStart(2, "0");
    return { year: Number(usDate[3]), iso: `${usDate[3]}-${month}-${day}` };
  }

  // YYYYMMDD, the DOB violation shape.
  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return { year: Number(compact[1]), iso: `${compact[1]}-${compact[2]}-${compact[3]}` };
  }

  return EMPTY;
}

export function recordYear(value: string | null | undefined): number | null {
  return parseRecordDate(value).year;
}

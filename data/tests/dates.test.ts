import { describe, expect, test } from "vitest";
import { parseRecordDate, recordYear } from "../src/dates.ts";

// Phase 1 kept every dataset's dates as filed, so this helper is the one place
// that reconciles the three shapes the fetchers produce. The cases below are the
// real formats: BIS MM/DD/YYYY, DOB YYYYMMDD, and the ISO timestamps HPD, CATS,
// and the elevator feed carry.
describe("parseRecordDate", () => {
  test("reads an ISO timestamp down to its date", () => {
    expect(parseRecordDate("2026-02-27T00:00:00.000")).toEqual({
      year: 2026,
      iso: "2026-02-27",
    });
  });

  test("reads a BIS MM/DD/YYYY date and zero-pads it", () => {
    expect(parseRecordDate("01/17/1995")).toEqual({ year: 1995, iso: "1995-01-17" });
    expect(parseRecordDate("3/8/2000")).toEqual({ year: 2000, iso: "2000-03-08" });
  });

  test("reads a DOB YYYYMMDD date", () => {
    expect(parseRecordDate("20251114")).toEqual({ year: 2025, iso: "2025-11-14" });
  });

  test("missing or unparseable strings become nulls, never NaN", () => {
    expect(parseRecordDate(null)).toEqual({ year: null, iso: null });
    expect(parseRecordDate(undefined)).toEqual({ year: null, iso: null });
    expect(parseRecordDate("")).toEqual({ year: null, iso: null });
    expect(parseRecordDate("not a date")).toEqual({ year: null, iso: null });
  });

  test("recordYear is the year alone", () => {
    expect(recordYear("01/17/1995")).toBe(1995);
    expect(recordYear("2019-08-22T10:59:45.000")).toBe(2019);
    expect(recordYear(null)).toBeNull();
  });
});

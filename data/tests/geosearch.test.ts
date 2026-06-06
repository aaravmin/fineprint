import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseBblCandidates, parseBblResponse } from "../src/geosearch.ts";

// Fixtures are real GeoSearch responses recorded 2026-06-06:
// https://geosearch.planninglabs.nyc/v2/search?text=350 5th Avenue, Manhattan
// The Empire State Building, BBL 1008350041. The response also contains
// Brooklyn's 350 5th Avenue further down — the parser must take the top match.
const match = JSON.parse(
  readFileSync(new URL("./fixtures/geosearch-350-5th-ave.json", import.meta.url), "utf8"),
);
const noMatch = JSON.parse(
  readFileSync(new URL("./fixtures/geosearch-no-match.json", import.meta.url), "utf8"),
);

describe("parseBblResponse", () => {
  test("extracts the BBL, address, and borough of the top match", () => {
    const result = parseBblResponse(match, "350 5th Avenue, Manhattan");

    expect(result.bbl).toBe("1008350041");
    expect(result.normalizedAddress).toBe("350 5 AVENUE, New York, NY, USA");
    expect(result.borough).toBe("Manhattan");
  });

  test("an address with no matches throws a clear error", () => {
    expect(() => parseBblResponse(noMatch, "zzzzz nowhere street xyzzy")).toThrow(
      /no NYC address found.*zzzzz nowhere street xyzzy/i,
    );
  });

  test("a match without a BBL throws rather than inventing one", () => {
    const stripped = structuredClone(match);
    for (const feature of stripped.features) {
      delete feature.properties.addendum;
    }

    expect(() => parseBblResponse(stripped, "350 5th Avenue, Manhattan")).toThrow(/BBL/);
  });

  test("candidates keep GeoSearch's ranking, skip BBL-less features, dedupe", () => {
    const candidates = parseBblCandidates(match, "350 5th Avenue, Manhattan");

    // The recorded response holds Manhattan's 350 5th Ave first and
    // Brooklyn's further down — both must survive, in order.
    expect(candidates[0].bbl).toBe("1008350041");
    expect(candidates.some(candidate => candidate.borough === "Brooklyn")).toBe(true);

    const bbls = candidates.map(candidate => candidate.bbl);
    expect(new Set(bbls).size).toBe(bbls.length);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { assessGeocode, parseBblCandidates, parseBblResponse } from "../src/geosearch.ts";

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

  test("candidates carry Pelias confidence and match type", () => {
    const exactFeature = {
      properties: {
        label: "345 PARK AVENUE, New York, NY, USA",
        borough: "Manhattan",
        confidence: 1,
        match_type: "exact",
        addendum: { pad: { bbl: "1013060001", bin: "1035862" } },
      },
    };

    const [candidate] = parseBblCandidates(
      { features: [exactFeature] },
      "345 Park Avenue, Manhattan",
    );
    expect(candidate.confidence).toBe(1);
    expect(candidate.matchType).toBe("exact");
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

describe("assessGeocode", () => {
  // The bug this guards: "999 Nowhere Street, Atlantis" fuzzy-matched to a
  // real Brooklyn lot (same house number, different street) and got ingested.
  // Pelias's confidence/match_type are useless — NYC GeoSearch reports
  // 0.8/"fallback" for perfect and garbage matches alike — so the gate
  // compares streets and boroughs instead.
  const atlantisCandidate = {
    bbl: "3056660020",
    bin: "3138062",
    normalizedAddress: "999 54 STREET, Brooklyn, NY, USA",
    borough: "Brooklyn",
    confidence: 0.8,
    matchType: "fallback",
  };

  const parkAvenueCandidate = {
    bbl: "1013060001",
    bin: "1035862",
    normalizedAddress: "345 PARK AVENUE, New York, NY, USA",
    borough: "Manhattan",
    confidence: 0.8,
    matchType: "fallback",
  };

  test("a different street is rejected with a human reason", () => {
    const verdict = assessGeocode("999 Nowhere Street, Atlantis", atlantisCandidate);

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/999 Nowhere Street, Atlantis/);
    expect(verdict.reason).toMatch(/999 54 STREET/);
  });

  test("the same street in the queried borough passes", () => {
    expect(assessGeocode("345 Park Avenue, Manhattan", parkAvenueCandidate).ok).toBe(
      true,
    );
  });

  test("the same street in the wrong borough fails", () => {
    const brooklynTwin = {
      ...parkAvenueCandidate,
      normalizedAddress: "345 PARK AVENUE, Brooklyn, NY, USA",
      borough: "Brooklyn",
    };

    const verdict = assessGeocode("345 Park Avenue, Manhattan", brooklynTwin);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/Manhattan/);
    expect(verdict.reason).toMatch(/Brooklyn/);
  });

  test("abbreviations and ordinals compare equal", () => {
    const fifthAvenue = {
      ...parkAvenueCandidate,
      normalizedAddress: "350 5 AVENUE, New York, NY, USA",
    };

    expect(assessGeocode("350 5th Ave, Manhattan", fifthAvenue).ok).toBe(true);
  });

  test("a query without a borough only has to match the street", () => {
    expect(assessGeocode("345 Park Avenue", parkAvenueCandidate).ok).toBe(true);
  });

  test("hyphenated Queens house numbers keep their street", () => {
    const queens = {
      ...parkAvenueCandidate,
      normalizedAddress: "58-01 GRAND AVENUE, Queens, NY, USA",
      borough: "Queens",
    };

    expect(assessGeocode("58-01 Grand Avenue, Queens", queens).ok).toBe(true);
  });
});

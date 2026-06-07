import { describe, expect, test } from "vitest";
import { rankBm25 } from "../src/bm25.ts";

const docs = [
  {
    id: "penalty",
    text: "The penalty is 268 dollars per ton of carbon dioxide over the limit.",
  },
  {
    id: "limits",
    text: "Emissions limits are set per occupancy group and compliance period.",
  },
  { id: "filing", text: "Reports are filed each year through the department portal." },
];

describe("rankBm25", () => {
  test("the document sharing the most query terms ranks first", () => {
    const ranked = rankBm25("penalty per ton over the limit", docs);

    expect(ranked[0].id).toBe("penalty");
    expect(ranked[0].score).toBeGreaterThan(0);
  });

  test("a rare term outweighs common ones", () => {
    // "268" appears in one doc; "the" appears everywhere.
    const ranked = rankBm25("the 268", docs);

    expect(ranked[0].id).toBe("penalty");
  });

  test("an empty query returns nothing", () => {
    expect(rankBm25("", docs)).toEqual([]);
  });

  test("topK caps the results", () => {
    const ranked = rankBm25("the", docs, 2);

    expect(ranked.length).toBeLessThanOrEqual(2);
  });

  test("documents with no overlap score zero and are dropped", () => {
    const ranked = rankBm25("zoning variance", docs);

    expect(ranked).toEqual([]);
  });
});

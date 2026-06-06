import { describe, it, expect } from "vitest";
import { retrieve, rankChunks, tokenize, CORPUS, type Chunk } from "../src/rag/retrieve.ts";

describe("corpus", () => {
  it("loads 6–10 curated chunks, each with a source title and an official URL", () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(6);
    expect(CORPUS.length).toBeLessThanOrEqual(10);
    for (const c of CORPUS) {
      expect(c.source.length).toBeGreaterThan(0);
      expect(c.url).toMatch(/^https?:\/\/(www\.)?(nyc\.gov|rules\.cityofnewyork\.us|accelerator\.nyc)/);
      expect(c.text.length).toBeGreaterThan(0);
      expect(c.id.length).toBeGreaterThan(0);
    }
  });

  it("has unique chunk ids", () => {
    const ids = CORPUS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("tokenize", () => {
  it("lowercases, splits hyphens, strips punctuation, and drops stopwords", () => {
    const t = tokenize("Do I qualify for the affordable-housing pathway?");
    expect(t).toContain("affordable");
    expect(t).toContain("housing");
    expect(t).toContain("pathway");
    expect(t).not.toContain("the");
    expect(t).not.toContain("do");
  });
});

describe("retrieve (BM25) over the LL97 corpus", () => {
  it("ranks the Article 321 chunk top-1 for the affordable-housing question", () => {
    const hits = retrieve("Do I qualify for the affordable-housing pathway?", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].source.toLowerCase()).toMatch(/article 321|321|affordable/);
    expect(hits[0].text.toLowerCase()).toMatch(/article 321|affordable-housing|rent-regulated/);
  });

  it("ranks the good-faith chunk top-1 for the good-faith question", () => {
    const hits = retrieve("What's a good-faith effort?", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text.toLowerCase()).toMatch(/good-faith|good faith/);
    expect(hits[0].source.toLowerCase()).toMatch(/good-faith|good faith/);
  });

  it("ranks the penalty chunk top-1 for a penalty-rate question", () => {
    const hits = retrieve("How much is the fine per ton over the cap?", 3);
    expect(hits[0].text).toMatch(/268/);
  });

  it("ranks the covered-building chunk top-1 for a coverage-threshold question", () => {
    const hits = retrieve("Is my building covered if it is over 25,000 square feet?", 3);
    expect(hits[0].text).toMatch(/25,000/);
  });

  it("every returned chunk carries a source and an official URL", () => {
    const hits = retrieve("emissions limit ESPM property type", 3);
    expect(hits.length).toBeGreaterThan(0);
    for (const c of hits as Chunk[]) {
      expect(c.source.length).toBeGreaterThan(0);
      expect(c.url).toMatch(/^https?:\/\//);
    }
  });

  it("returns at most k results, descending by score", () => {
    const hits = rankChunks("emissions limit", CORPUS, 2);
    expect(hits.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it("returns empty for a query with no corpus term overlap", () => {
    expect(retrieve("xylophone bicycle quasar", 3)).toEqual([]);
  });
});

// FinePrint — RAG retrieval module.
//
// Loads the curated Local Law 97 corpus (./corpus/*.md) at module init and
// exposes a pure, deterministic, offline BM25 retriever. A drafting/ask layer
// turns the returned Chunks into Citations — this module never touches the
// network or an LLM.
//
// Corpus chunk format: each .md file is one or more chunks separated by a line
// that is exactly "---". Each chunk's first line is a header of the form
//   --- source: <name> | url: <official URL> ---
// and the remaining lines are the rule text.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface Chunk {
  id: string;
  source: string;
  url: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Corpus loading
// ---------------------------------------------------------------------------

// Resolved relative to THIS module (not process.cwd()) so the corpus loads no
// matter where the package is run from — vitest, the agents worker, or a bundled
// build — and stays co-located with its source.
const CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), "corpus");

// Matches a header line: "--- source: <name> | url: <url> ---"
const HEADER_RE = /^---\s*source:\s*(.+?)\s*\|\s*url:\s*(.+?)\s*---$/i;

function parseFile(raw: string, file: string): Chunk[] {
  const blocks = raw
    .split(/^---$/m)              // chunk separators are lines of exactly "---"
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: Chunk[] = [];
  blocks.forEach((block, i) => {
    const nl = block.indexOf("\n");
    const headerLine = (nl === -1 ? block : block.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : block.slice(nl + 1)).trim();
    const m = HEADER_RE.exec(headerLine);
    if (!m) return; // skip malformed blocks rather than emit a junk chunk
    chunks.push({
      id: `${file}#${i}`,
      source: m[1].trim(),
      url: m[2].trim(),
      text: body,
    });
  });
  return chunks;
}

function loadCorpus(): Chunk[] {
  const files = readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort(); // deterministic order
  return files.flatMap((f) =>
    parseFile(readFileSync(join(CORPUS_DIR, f), "utf8"), f.replace(/\.md$/, "")),
  );
}

/** The curated LL97 corpus, loaded once at module init. */
export const CORPUS: Chunk[] = loadCorpus();

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  (
    "a an and are as at be by do does for from how i if in into is it its my of on or " +
    "that the their them these this to under up was we what when where which who whom whose " +
    "why will with would you your"
  ).split(/\s+/),
);

/** Lowercase, split on non-alphanumerics (so "good-faith" -> good, faith), drop stopwords and 1-char tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// ---------------------------------------------------------------------------
// BM25 retrieval (pure, deterministic)
// ---------------------------------------------------------------------------

export interface RetrievedChunk {
  chunk: Chunk;
  score: number;
}

const K1 = 1.5;
const B = 0.75;

/**
 * Score every chunk in `corpus` against `query` with Okapi BM25 and return the
 * top-k matches (score > 0) in descending score order. Pure and offline.
 * The chunk's `source` is included in the indexed text so a query that names a
 * concept appearing only in the title still matches.
 */
export function rankChunks(query: string, corpus: Chunk[] = CORPUS, k = 3): RetrievedChunk[] {
  const qTerms = tokenize(query);
  if (qTerms.length === 0 || corpus.length === 0) return [];

  const docs = corpus.map((c) => tokenize(`${c.source} ${c.text}`));
  const N = docs.length;
  const avgdl = docs.reduce((s, d) => s + d.length, 0) / N;

  // document frequency per unique query term
  const df = new Map<string, number>();
  for (const term of new Set(qTerms)) {
    df.set(term, docs.filter((d) => d.includes(term)).length);
  }

  const scored: RetrievedChunk[] = corpus.map((chunk, i) => {
    const d = docs[i];
    const dl = d.length;
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);

    let score = 0;
    for (const term of qTerms) {
      const n = df.get(term) ?? 0;
      if (n === 0) continue;
      const f = tf.get(term) ?? 0;
      if (f === 0) continue;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5)); // always-positive BM25 idf
      score += (idf * (f * (K1 + 1))) / (f + K1 * (1 - B + (B * dl) / avgdl));
    }
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Public retriever: return the top-k corpus chunks for a query, best first.
 * Returns an empty array when nothing in the corpus overlaps the query.
 */
export function retrieve(query: string, k = 3): Chunk[] {
  return rankChunks(query, CORPUS, k).map((r) => r.chunk);
}

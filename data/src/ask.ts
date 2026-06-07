// Retrieval over the curated LL97 corpus: statute and rule chunks, each
// verified against its primary source and carrying that source's URL.
// BM25 does the ranking; the model that consumes these chunks is instructed
// to answer only from them. Node-only (filesystem read), like the CBL
// snapshot — the dashboard never imports this.

import { readFileSync } from "node:fs";
import { rankBm25 } from "./bm25.ts";

export interface LawChunk {
  id: string;
  source: string;
  url: string;
  text: string;
}

let loadedCorpus: LawChunk[] | null = null;

function corpus(): LawChunk[] {
  if (!loadedCorpus) {
    loadedCorpus = JSON.parse(
      readFileSync(new URL("../corpus/ll97.json", import.meta.url), "utf8"),
    ) as LawChunk[];
  }
  return loadedCorpus;
}

export function retrieveLawChunks(question: string, topK = 4): LawChunk[] {
  const chunks = corpus();
  const hits = rankBm25(question, chunks, topK);

  // BM25 scores common words too; demand a minimum so off-topic questions
  // come back empty and the caller can refuse instead of citing noise.
  const MIN_SCORE = 1.0;

  return hits
    .filter(hit => hit.score >= MIN_SCORE)
    .map(hit => chunks.find(chunk => chunk.id === hit.id)!)
    .filter(Boolean);
}

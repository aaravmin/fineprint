// fineprint-advise — the funded fix-it-plan layer.
//
// Pure, deterministic economics on top of the engine's FineResult[]:
//   - roi.ts          ranked retrofit fix candidates (payback, rebate matching)
//   - optimize/       exact-optimal retrofit plan + MACC curve + schedule
//   - catalogs/       verified 2026 retrofit-measure and rebate data
//   - rag/            offline BM25 retriever over the curated LL97 statute corpus
//
// Code computes every number here; an AI layer only ranks/explains/cites. This
// package performs no network I/O and is engine-grade deterministic; the RAG
// loader reads its bundled corpus from disk and is therefore Node-only.

export * from "./catalogs/types.ts";
export { MEASURES } from "./catalogs/measures.ts";
export { REBATES } from "./catalogs/rebates.ts";
export * from "./roi.ts";
export * from "./optimize/retrofit.ts";
export * from "./rag/retrieve.ts";

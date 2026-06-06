// BBL -> Article 321 signals via HPD affordable-housing datasets. The engine
// only honors the flag; deciding it is this module's job. Returns null when
// the datasets say nothing either way.

import type { Bbl } from "./types.ts";

export async function fetchArticle321Flag(bbl: Bbl): Promise<boolean | null> {
  throw new Error("fetchArticle321Flag is not implemented yet");
}

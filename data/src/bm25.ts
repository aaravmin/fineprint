// Plain BM25 ranking (k1 = 1.2, b = 0.75) so law lookup runs offline with
// zero dependencies. Tokens are lowercase alphanumeric runs; scoring is the
// textbook formula, nothing clever.

export interface Bm25Doc {
  id: string;
  text: string;
}

export interface Bm25Hit {
  id: string;
  score: number;
}

const K1 = 1.2;
const B = 0.75;

export function rankBm25(query: string, docs: Bm25Doc[], topK = 4): Bm25Hit[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || docs.length === 0) {
    return [];
  }

  const docTokens = docs.map(doc => tokenize(doc.text));
  const averageLength =
    docTokens.reduce((sum, tokens) => sum + tokens.length, 0) / docs.length;

  const documentFrequency = new Map<string, number>();
  for (const term of new Set(queryTerms)) {
    const count = docTokens.filter(tokens => tokens.includes(term)).length;
    documentFrequency.set(term, count);
  }

  const hits = docs.map((doc, index) => {
    const tokens = docTokens[index];
    let score = 0;

    for (const term of new Set(queryTerms)) {
      const df = documentFrequency.get(term) ?? 0;
      if (df === 0) continue;

      const tf = tokens.filter(token => token === term).length;
      if (tf === 0) continue;

      const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
      const lengthNorm = 1 - B + B * (tokens.length / averageLength);
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * lengthNorm));
    }

    return { id: doc.id, score };
  });

  return hits
    .filter(hit => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

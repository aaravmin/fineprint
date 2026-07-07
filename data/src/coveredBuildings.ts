// LL97 / LL84 / LL87 / LL88 applicability and the Article 321 flag, answered
// from DOB's Covered Buildings List — the authoritative annual list, not a
// square-footage guess. DOB publishes it as a per-BIN Excel workbook; a
// committed snapshot (data/cbl/cbl26.json.gz, rebuilt by
// data/scripts/refresh-cbl.py) aggregates it to ~29k covered BBLs.
//
// LL97 compliance pathway 3 means the building is subject to Article 321,
// so the snapshot also answers the affordable-housing flag — no separate
// HPD lookup needed.
//
// Node-only (reads the snapshot from disk). The browser never imports this;
// it sees building facts through the database.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { Bbl } from "./types.ts";

export interface CblEntry {
  ll97: boolean;
  article321: boolean;
  ll84: boolean;
  ll87: boolean;
  ll88: boolean;
  dofGrossSqft: number | null;
  dofAddress: string | null;
  source: string;
}

interface CblSnapshot {
  source: string;
  buildings: Record<
    string,
    {
      ll97: boolean;
      cp: number[];
      ll84: boolean;
      ll87: boolean;
      ll88: boolean;
      gsf: number | null;
      addr: string | null;
    }
  >;
}

const ARTICLE_321_PATHWAY = 3;

let cachedSnapshot: CblSnapshot | null = null;

function loadSnapshot(): CblSnapshot {
  if (!cachedSnapshot) {
    const gzipped = readFileSync(new URL("../cbl/cbl26.json.gz", import.meta.url));
    cachedSnapshot = JSON.parse(gunzipSync(gzipped).toString("utf8")) as CblSnapshot;
  }

  return cachedSnapshot;
}

// Null means the BBL is absent from the list — not covered by any of the
// four laws, or not a building DOB knows about.
export function getCblEntry(bbl: Bbl): CblEntry | null {
  const snapshot = loadSnapshot();
  const raw = snapshot.buildings[bbl];
  if (!raw) {
    return null;
  }

  return {
    ll97: raw.ll97,
    article321: raw.cp.includes(ARTICLE_321_PATHWAY),
    ll84: raw.ll84,
    ll87: raw.ll87,
    ll88: raw.ll88,
    dofGrossSqft: raw.gsf,
    dofAddress: raw.addr,
    source: snapshot.source,
  };
}

export async function isLl97Covered(bbl: Bbl): Promise<boolean> {
  return getCblEntry(bbl)?.ll97 ?? false;
}

export async function fetchArticle321Flag(bbl: Bbl): Promise<boolean> {
  return getCblEntry(bbl)?.article321 ?? false;
}

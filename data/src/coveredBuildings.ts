// LL97 applicability and the Article 321 flag, answered from DOB's Covered
// Buildings List - the authoritative annual list, not a square-footage guess.
// DOB publishes it as a per-BIN Excel workbook; a committed snapshot
// (data/cbl/cbl26.json.gz, rebuilt by data/scripts/refresh-cbl.py) aggregates
// it to ~29k covered BBLs.
//
// LL97 compliance pathway 3 means the building is subject to Article 321,
// so the snapshot also answers the affordable-housing flag — no separate
// HPD lookup needed.
//
// Node-only (reads the snapshot from disk). The browser never imports this;
// it sees building facts through SpacetimeDB.

import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Bbl } from "./types.ts";

export interface CblEntry {
  ll97: boolean;
  article321: boolean;
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
      gsf: number | null;
      addr: string | null;
    }
  >;
}

const ARTICLE_321_PATHWAY = 3;

let cachedSnapshot: CblSnapshot | null = null;

// The CBL snapshot ships as a file. Under normal execution (tsx, scripts) it
// sits next to this module at ../cbl. When the data layer is bundled into a
// Trigger.dev task, import.meta.url points into the bundle and the additionalFiles
// build extension copies the file to a cwd-relative data/cbl instead — so try
// every known location and use whichever exists. CBL_PATH overrides all of them.
function resolveCblPath(): string {
  if (process.env.CBL_PATH && existsSync(process.env.CBL_PATH)) {
    return process.env.CBL_PATH;
  }

  // Walk up from the module and the cwd looking for the file at cbl/ or
  // data/cbl/. Normal execution finds data/cbl a level or two up; in a bundled
  // Trigger.dev task the build extension copies it to <build-root>/data/cbl,
  // and import.meta.url sits several levels below that root — so an upward walk
  // finds it either way without hard-coding the (varying) build path.
  const relatives = ["cbl/cbl26.json.gz", "data/cbl/cbl26.json.gz"];
  const starts = [dirname(fileURLToPath(import.meta.url)), process.cwd()];

  for (const start of starts) {
    let dir = start;
    while (true) {
      for (const relative of relatives) {
        const candidate = join(dir, relative);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
      const parent = dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }

  throw new Error(
    `CBL snapshot not found by walking up from ${starts.join(" or ")}. Set CBL_PATH to its location.`,
  );
}

function loadSnapshot(): CblSnapshot {
  if (!cachedSnapshot) {
    const gzipped = readFileSync(resolveCblPath());
    cachedSnapshot = JSON.parse(gunzipSync(gzipped).toString("utf8")) as CblSnapshot;
  }

  return cachedSnapshot;
}

// Null means the BBL is absent from the list - not covered by LL97, or not a
// building DOB knows about.
export function getCblEntry(bbl: Bbl): CblEntry | null {
  const snapshot = loadSnapshot();
  const raw = snapshot.buildings[bbl];
  if (!raw) {
    return null;
  }

  return {
    ll97: raw.ll97,
    article321: raw.cp.includes(ARTICLE_321_PATHWAY),
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

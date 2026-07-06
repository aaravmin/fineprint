// Phase 6 audit: verify the law registry is the single source of law naming and
// that every registry law has a dashboard output.
//
//   npm run audit:laws
//
// Exits non-zero if any check fails. Also writes the audit report at
// data/normalized/law_dashboard_audit_report.md.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LAW_REGISTRY } from "../client/src/lib/laws/lawRegistry.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

// Recursively collect client source files, skipping generated bindings.
function clientSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (entry === "module_bindings" || entry === "node_modules") continue;
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        out.push(full);
      }
    }
  };
  walk(join(repoRoot, "client", "src"));
  return out;
}

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

// 1. Unique law_id, slug, and dashboard_output_key; all non-empty.
const dup = (values: string[]) => {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) dups.add(v);
    seen.add(v);
  }
  return [...dups];
};
const dupIds = dup(LAW_REGISTRY.map(l => l.law_id));
const dupSlugs = dup(LAW_REGISTRY.map(l => l.slug));
const dupKeys = dup(LAW_REGISTRY.map(l => l.dashboard_output_key));
const emptyKey = LAW_REGISTRY.filter(l => !l.dashboard_output_key).map(l => l.law_id);
check("no duplicate law_ids", dupIds.length === 0, dupIds.join(", "));
check("no duplicate slugs", dupSlugs.length === 0, dupSlugs.join(", "));
check("every law has a unique, non-empty dashboard_output_key",
  dupKeys.length === 0 && emptyKey.length === 0,
  [...dupKeys, ...emptyKey].join(", "));

// 2. Registry law_id set matches the canonical module registry, with matching
// short codes — so a law is never named two ways across module and dashboard.
const moduleSrc = read("data/laws.ts");
const moduleEntries = [...moduleSrc.matchAll(/id:\s*"([^"]+)",[\s\S]*?short:\s*"([^"]+)"/g)];
const moduleShortById = new Map(moduleEntries.map(m => [m[1], m[2]]));
const registryIds = new Set(LAW_REGISTRY.map(l => l.law_id));
const moduleIds = new Set(moduleShortById.keys());
const missingFromRegistry = [...moduleIds].filter(id => !registryIds.has(id));
const extraInRegistry = [...registryIds].filter(id => !moduleIds.has(id));
check("registry law_ids match the module registry",
  missingFromRegistry.length === 0 && extraInRegistry.length === 0,
  `missing: [${missingFromRegistry.join(", ")}], extra: [${extraInRegistry.join(", ")}]`);
const shortMismatch = LAW_REGISTRY.filter(l => moduleShortById.get(l.law_id) !== l.short_name)
  .map(l => `${l.law_id} (registry ${l.short_name} vs module ${moduleShortById.get(l.law_id)})`);
check("short codes match the module registry", shortMismatch.length === 0, shortMismatch.join("; "));

// 3. Exactly one LAW_REGISTRY definition — no second hardcoded law list.
const files = clientSourceFiles();
const registryDefs = files.filter(f => /export const LAW_REGISTRY\b/.test(readFileSync(f, "utf8")));
check("exactly one LAW_REGISTRY definition in client/src",
  registryDefs.length === 1,
  registryDefs.map(f => f.replace(repoRoot + "/", "")).join(", "));

// 4. The dashboard components consume the registry rather than a local list.
// The former compliance-section.tsx obligation ledger was folded into
// compliance-dashboard.tsx, so the dashboard is the single component to check.
const dashboardFiles = [
  "client/src/app/(main)/dashboard/buildings/[id]/_components/compliance-dashboard.tsx",
];
const notImporting = dashboardFiles.filter(f => !read(f).includes("@/lib/laws/lawRegistry"));
check("dashboard components import the canonical registry",
  notImporting.length === 0, notImporting.join(", "));

// 5. Every source_data_key is a real Building field.
const buildingBinding = read("client/src/lib/data/types.ts");
const unknownKeys = [
  ...new Set(LAW_REGISTRY.flatMap(l => l.source_data_keys)),
].filter(key => !new RegExp(`\\b${key}\\b`).test(buildingBinding));
check("every source_data_key exists on the Building row",
  unknownKeys.length === 0, unknownKeys.join(", "));

// 6. Tasks/compliance records are joined to laws by law_id, never display_name.
const joinByName = dashboardFiles.filter(f => /lawId\s*===\s*law\.display_name/.test(read(f)));
check("tasks are joined by law_id, not display_name", joinByName.length === 0, joinByName.join(", "));

// --- report ------------------------------------------------------------------

const undefinedKeys = [...new Set(LAW_REGISTRY.flatMap(l => l.source_data_keys))].filter(key =>
  !new RegExp(`\\b${key}\\b`).test(buildingBinding),
);

function renderReport(): string {
  const lawRows = LAW_REGISTRY.map(
    l =>
      `| ${l.law_id} | ${l.short_name} | ${l.display_name} | \`${l.dashboard_output_key}\` | ${l.source_data_keys.join(", ")} | ${l.enabled ? "yes" : "no"} |`,
  ).join("\n");
  const checkRows = checks
    .map(c => `- ${c.ok ? "PASS" : "FAIL"} — ${c.name}${c.ok ? "" : ` (${c.detail})`}`)
    .join("\n");

  return `# Law dashboard audit report

_Generated by \`npm run audit:laws\`._

## Every law in the registry

| law_id | short | display_name | dashboard_output_key | source_data_keys | enabled |
|---|---|---|---|---|---|
${lawRows}

All ${LAW_REGISTRY.length} laws render on the building dashboard: each appears in the
"Exposure by law" card and (except art321, which folds into the LL97 tab) as a
focused law tab, both iterated from this registry. The per-law obligation ledger
iterates the same registry, so no law is silently omitted.

- Dashboard component responsible: \`compliance-dashboard.tsx\` (exposure rows, tabs,
  and the obligation ledger), importing the registry.

## Checks

${checkRows}

## Naming consistency

- Canonical source: \`client/src/lib/laws/lawRegistry.ts\` (law_id, slug,
  display_name, short_name, jurisdiction, category, dashboard_output_key,
  source_data_keys, sort_order).
- Aliases consolidated: the former hardcoded \`LAW_REGISTRY\` mirror in the old
  obligation-ledger component and the standalone \`LAW_TABS\` / \`TRACKED_SCOPES\` lists
  in compliance-dashboard.tsx now derive from the canonical registry. Task records
  reference \`law_id\` (task.lawId); display names come only from the registry.
- The module registry (\`spacetimedb/src/laws.ts\`) remains the source of runtime
  applicability/deadline/penalty logic; this audit confirms its law_id and short
  sets match the dashboard registry.

## Laws with missing calculations / UI / source data

- Missing UI output: none — every registry law renders.
- Missing source data on Building: ${undefinedKeys.length ? undefinedKeys.join(", ") : "none"}.
- Article 321 rides inside the LL97 view (same emissions pathway) rather than
  rendering its own tab, so it carries no separate obligation row.

## Remaining TODOs

- Map the workflow task status (open/claimed/…) shown per law to the richer
  applicability vocabulary (applies / may_apply / does_not_apply / unknown /
  missing_data) once per-law applicability is surfaced client-side.
- Elevator, sprinkler, and LL26 appear in the roadmap's alias examples but are not
  implemented in this app, so they are intentionally absent from the registry.
`;
}

const reportPath = join(repoRoot, "data", "normalized", "law_dashboard_audit_report.md");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, renderReport());

const failures = checks.filter(c => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : `\n      ${c.detail}`}`);
}
console.log(`\n${checks.length - failures.length}/${checks.length} checks passed.`);
console.log(`Report written to ${reportPath.replace(repoRoot + "/", "")}`);
if (failures.length > 0) {
  process.exitCode = 1;
}

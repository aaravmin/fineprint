// Phase 7.8 audit: verify the compliance binder is wired end to end — data
// models, obligation templates per law, evidence checklists, vendor assignment,
// dashboard linkage, and a working export.
//
//   npm run audit:binder
//
// Exits non-zero on any failure. Writes the report at
// data/normalized/compliance_binder_audit_report.md and a sample export at
// data/exports/compliance_binder_sample.json.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LAW_EVIDENCE,
  LAW_REGISTRY,
  evidenceForLaw,
} from "../client/src/lib/laws/lawRegistry.ts";
import {
  binderLawOrder,
  buildBinderExport,
  type BinderObligation,
} from "../client/src/lib/compliance/binder.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail = "") => checks.push({ name, ok, detail });

const schema = read("spacetimedb/src/schema.ts");
const reducers = read("spacetimedb/src/reducers.ts");
const dashboard = read(
  "client/src/app/(main)/dashboard/buildings/[id]/_components/compliance-dashboard.tsx",
);

// 1. The four binder tables exist.
for (const tableName of ["vendor", "obligation", "evidence", "binder_event"]) {
  check(`table "${tableName}" exists`, new RegExp(`name:\\s*"${tableName}"`).test(schema));
}

// 2. Obligations can be assigned a vendor; evidence can store proof and maps to
// an obligation + law.
check("obligation can be assigned a vendor (vendorId column)", /obligation[\s\S]*?vendorId/.test(schema));
check("evidence stores proof files (fileName / fileUrlOrKey)", /evidence[\s\S]*?fileUrlOrKey/.test(schema));
check("evidence maps to an obligation and a law", /evidence[\s\S]*?obligationId[\s\S]*?lawId/.test(schema));

// 3. The binder reducers exist.
for (const reducer of [
  "seed_obligations", "add_vendor", "assign_vendor", "set_obligation_status",
  "add_evidence", "set_evidence_verification", "add_binder_note",
]) {
  check(`reducer "${reducer}" exists`, new RegExp(`export const ${reducer}\\b`).test(reducers));
}

// 4. Every registry law has an obligation/evidence template (or is explicitly
// empty — a "no template yet" law, never a missing one).
const lawsMissingTemplate = LAW_REGISTRY.filter(l => !(l.law_id in LAW_EVIDENCE)).map(l => l.law_id);
check("every law has an evidence checklist entry", lawsMissingTemplate.length === 0, lawsMissingTemplate.join(", "));

// 5. The dashboard links law cards to a binder section.
check("dashboard renders the compliance binder", dashboard.includes("ComplianceBinder"));

// 6. Every building can export a binder; the export surfaces missing required
// evidence rather than hiding it.
const sampleObligations: BinderObligation[] = binderLawOrder().map((law, i) => ({
  id: String(i + 1),
  lawId: law.law_id,
  title: law.display_name,
  status: "not_started",
  dueDate: null,
  responsibleParty: "",
  vendorId: null,
  filingReferenceNumber: "",
  notes: "",
  completedAt: null,
}));
const sampleExport = buildBinderExport({
  building: {
    id: "sample",
    address: "350 Sample Ave, Manhattan",
    bbl: "1008350041",
    sqft: 250_000,
    buildingType: "Office",
    yearBuilt: null,
    primaryUse: "Office",
  },
  obligations: sampleObligations,
  evidence: [],
  vendors: [],
  history: [{ kind: "obligation_created", summary: "Binder set up", lawId: "ll97", at: new Date().toISOString() }],
  generatedAt: "1970-01-01T00:00:00.000Z",
});
const requiredSections = [
  "building_summary", "compliance_snapshot", "law_by_law_obligations",
  "open_items", "compliance_history", "source_appendix", "assumptions_and_limitations",
];
const missingSections = requiredSections.filter(s => !(s in sampleExport));
check("export produces every required section", missingSections.length === 0, missingSections.join(", "));
check("export surfaces missing required evidence",
  sampleExport.law_by_law_obligations.some(o => o.missing_required_evidence.length > 0));
check("every exported obligation maps to a known law",
  sampleExport.law_by_law_obligations.every(o => LAW_REGISTRY.some(l => l.law_id === o.law_id)));

// --- outputs -----------------------------------------------------------------

const exportPath = join(repoRoot, "data", "exports", "compliance_binder_sample.json");
mkdirSync(dirname(exportPath), { recursive: true });
writeFileSync(exportPath, `${JSON.stringify(sampleExport, null, 2)}\n`);

function renderReport(): string {
  const list = (items: string[]) => (items.length ? items.map(i => `- ${i}`).join("\n") : "- (none)");
  const evidenceRows = LAW_REGISTRY.map(l => {
    const e = evidenceForLaw(l.law_id);
    const template = e.required.length === 0 && e.recommended.length === 0 ? "no_obligation_template_yet" : "templated";
    return `| ${l.law_id} | ${template} | ${e.required.length} | ${e.recommended.length} |`;
  }).join("\n");
  const checkRows = checks.map(c => `- ${c.ok ? "PASS" : "FAIL"} — ${c.name}${c.ok ? "" : ` (${c.detail})`}`).join("\n");

  return `# Compliance binder audit report

_Generated by \`npm run audit:binder\`._

## Data models created or updated

- SpacetimeDB tables: \`vendor\`, \`obligation\`, \`evidence\`, \`binder_event\` (owner-scoped, RLS owner views).
- Reducers: seed_obligations, add_vendor, assign_vendor, set_obligation_status, add_evidence, set_evidence_verification, add_binder_note — each appends a customer-facing binder_event.
- Export model: \`client/src/lib/compliance/binder.ts\` (buildBinderExport).

## Obligation / evidence templates by law

| law_id | template | required evidence | recommended evidence |
|---|---|---|---|
${evidenceRows}

## Vendor role types supported

${list(["QEWI", "LMP", "energy_auditor", "retro_commissioning_agent", "contractor", "engineer", "architect", "expeditor", "property_manager", "elevator_vendor", "sprinkler_vendor", "general_vendor", "other"])}

## Dashboard components updated

- \`ComplianceBinder.tsx\` (binder, obligation rows with status / vendor assignment / proof filing / evidence checklist, vendor management, compliance history, export).
- Linked from the building compliance dashboard (\`compliance-dashboard.tsx\`, "All laws" view).

## Export format

- Per-building JSON via the dashboard's "Export binder" button (compliance_binder_{building_id}.json).
- A structural sample is written to \`data/exports/compliance_binder_sample.json\`.

## Laws missing obligation templates / evidence checklists

- Missing checklists: ${lawsMissingTemplate.length ? lawsMissingTemplate.join(", ") : "none"}.
- LL96 (PACE) and LL55 carry empty *required* lists by design — PACE is an opportunity, and LL55 has no DOB filing — so their proof is recommended_evidence, never invented as required.

## Checks

${checkRows}

## Remaining TODOs

- Wire \`expirationDate\` on evidence into an "expired document" status surfaced in the binder.
- Per-owner server-side export endpoint (today the export is generated in the authenticated client; the sample here is structural).
`;
}

const reportPath = join(repoRoot, "data", "normalized", "compliance_binder_audit_report.md");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, renderReport());

const failures = checks.filter(c => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : `\n      ${c.detail}`}`);
}
console.log(`\n${checks.length - failures.length}/${checks.length} checks passed.`);
console.log(`Sample export: ${exportPath.replace(repoRoot + "/", "")}`);
console.log(`Report: ${reportPath.replace(repoRoot + "/", "")}`);
if (failures.length > 0) {
  process.exitCode = 1;
}

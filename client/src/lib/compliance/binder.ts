// The compliance binder: the owner's exportable, defensible compliance record
// (Phase 7). This module is pure — plain shapes in, a structured export out — so
// the dashboard (live SpacetimeDB rows mapped to these shapes) and a script (a
// sample building) can both produce a binder the same way. It is deliberately
// not the internal event log: the history here is the owner's plain-language
// trail, assembled from binder_event rows.

import {
  evidenceForLaw,
  lawById,
  lawsInOrder,
  type LawEvidence,
} from "../laws/lawRegistry";

// Plain shapes (a row from each binder table, decoupled from the bindings).
export interface BinderBuilding {
  id: string;
  address: string;
  bbl: string | null;
  sqft: number;
  buildingType: string | null;
  yearBuilt: number | null;
  primaryUse: string | null;
}
export interface BinderVendor {
  id: string;
  name: string;
  company: string;
  roleType: string;
  email: string;
  phone: string;
  licenseNumber: string;
  licenseType: string;
}
export interface BinderObligation {
  id: string;
  lawId: string;
  title: string;
  status: string;
  dueDate: string | null;
  responsibleParty: string;
  vendorId: string | null;
  filingReferenceNumber: string;
  notes: string;
  completedAt: string | null;
}
export interface BinderEvidence {
  id: string;
  obligationId: string;
  lawId: string;
  fileName: string;
  fileType: string;
  issuer: string;
  documentDate: string | null;
  filingReferenceNumber: string;
  verificationStatus: string;
}
export interface BinderHistoryEvent {
  kind: string;
  summary: string;
  lawId: string;
  at: string;
}

export interface BinderInputs {
  building: BinderBuilding;
  obligations: BinderObligation[];
  evidence: BinderEvidence[];
  vendors: BinderVendor[];
  history: BinderHistoryEvent[];
  generatedAt?: string;
}

// A status is "open" (needs attention) unless it is one of these settled ones.
const SETTLED = new Set(["completed", "filed", "not_applicable"]);

// What proof is on file vs still expected for one obligation, against the law's
// evidence checklist. Missing required proof is surfaced, never hidden.
export interface EvidenceCoverage {
  required: { type: string; present: boolean }[];
  recommended: { type: string; present: boolean }[];
  missingRequired: string[];
}

function coverageFor(
  lawId: string,
  obligationEvidence: BinderEvidence[],
): EvidenceCoverage {
  const checklist: LawEvidence = evidenceForLaw(lawId);
  // A checklist item counts as present if any uploaded file's name or type
  // mentions it loosely; this is a best-effort match an owner can override.
  const present = (type: string) =>
    obligationEvidence.some(e =>
      `${e.fileName} ${e.fileType} ${e.issuer}`.toLowerCase().includes(
        type.toLowerCase().split(" ")[0],
      ),
    );
  const required = checklist.required.map(type => ({ type, present: present(type) }));
  const recommended = checklist.recommended.map(type => ({ type, present: present(type) }));
  return {
    required,
    recommended,
    missingRequired: required.filter(r => !r.present).map(r => r.type),
  };
}

export interface BinderObligationExport {
  law_id: string;
  law: string;
  short: string;
  status: string;
  due_date: string | null;
  responsible_party: string;
  assigned_vendor: { name: string; company: string; role: string } | null;
  filing_reference_number: string;
  evidence_on_file: { file_name: string; issuer: string; verification_status: string }[];
  missing_required_evidence: string[];
  recommended_evidence_not_on_file: string[];
  completion_date: string | null;
  notes: string;
}

export interface BinderExport {
  building_summary: BinderBuilding & { source_note: string };
  compliance_snapshot: {
    obligations_total: number;
    open_items: number;
    settled_items: number;
    obligations_missing_required_evidence: number;
    nearest_due_date: string | null;
  };
  law_by_law_obligations: BinderObligationExport[];
  open_items: string[];
  compliance_history: BinderHistoryEvent[];
  source_appendix: string[];
  assumptions_and_limitations: string[];
  generated_at: string;
}

export function buildBinderExport(inputs: BinderInputs): BinderExport {
  const { building, obligations, evidence, vendors } = inputs;
  const vendorById = new Map(vendors.map(v => [v.id, v]));

  const obligationExports: BinderObligationExport[] = obligations
    .slice()
    .sort((a, b) => {
      const order = (id: string) => lawById(id)?.sort_order ?? 99;
      return order(a.lawId) - order(b.lawId);
    })
    .map(obligation => {
      const law = lawById(obligation.lawId);
      const own = evidence.filter(e => e.obligationId === obligation.id);
      const coverage = coverageFor(obligation.lawId, own);
      const vendor = obligation.vendorId ? vendorById.get(obligation.vendorId) : undefined;

      return {
        law_id: obligation.lawId,
        law: law?.display_name ?? obligation.title,
        short: law?.short_name ?? obligation.lawId,
        status: obligation.status,
        due_date: obligation.dueDate,
        responsible_party: obligation.responsibleParty,
        assigned_vendor: vendor
          ? { name: vendor.name, company: vendor.company, role: vendor.roleType }
          : null,
        filing_reference_number: obligation.filingReferenceNumber,
        evidence_on_file: own.map(e => ({
          file_name: e.fileName,
          issuer: e.issuer,
          verification_status: e.verificationStatus,
        })),
        missing_required_evidence: coverage.missingRequired,
        recommended_evidence_not_on_file: coverage.recommended
          .filter(r => !r.present)
          .map(r => r.type),
        completion_date: obligation.completedAt,
        notes: obligation.notes,
      };
    });

  const openItems = obligationExports.filter(o => !SETTLED.has(o.status));
  const dueDates = obligationExports
    .map(o => o.due_date)
    .filter((d): d is string => !!d)
    .sort();

  return {
    building_summary: {
      ...building,
      source_note:
        "Building facts from NYC public records (PLUTO, LL84 disclosure, DOB) where available.",
    },
    compliance_snapshot: {
      obligations_total: obligationExports.length,
      open_items: openItems.length,
      settled_items: obligationExports.length - openItems.length,
      obligations_missing_required_evidence: obligationExports.filter(
        o => o.missing_required_evidence.length > 0,
      ).length,
      nearest_due_date: dueDates[0] ?? null,
    },
    law_by_law_obligations: obligationExports,
    open_items: openItems.map(
      o =>
        `${o.short}: ${o.status.replace(/_/g, " ")}` +
        (o.missing_required_evidence.length
          ? ` — missing ${o.missing_required_evidence.join(", ")}`
          : ""),
    ),
    compliance_history: inputs.history,
    source_appendix: [
      "Law applicability, deadlines, and penalty estimates: Fineprint law registry (NYC Admin Code citations per law).",
      "Building characteristics: NYC PLUTO and LL84 benchmarking disclosure.",
      "Evidence checklists: each law's statutory filing; uncertain items are marked recommended, not required.",
    ],
    assumptions_and_limitations: [
      "This binder is an owner record, not a legal determination or a filed report.",
      "Penalty and deadline figures are estimates from available records; professional verification is recommended before filing or capital decisions.",
      "Evidence-to-checklist matching is best-effort by file name; confirm each item against the actual document.",
    ],
    generated_at: inputs.generatedAt ?? new Date().toISOString(),
  };
}

// The evidence checklist coverage for one obligation — used by the UI to show
// what proof is on file vs missing, without rebuilding the whole export.
export function obligationCoverage(
  lawId: string,
  obligationEvidence: BinderEvidence[],
): EvidenceCoverage {
  return coverageFor(lawId, obligationEvidence);
}

// All laws that bind nothing yet still deserve a binder template, in order — the
// UI seeds an obligation per applicable law, so the binder mirrors the registry.
export function binderLawOrder() {
  return lawsInOrder().filter(law => law.law_id !== "ll96" && law.law_id !== "art321");
}

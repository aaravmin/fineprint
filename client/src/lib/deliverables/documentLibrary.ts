// The standardized library of documents an owner has uploaded for a building.
// Fineprint doesn't re-key or interpret the files — it gives the set one consistent
// cover: the building's identifiers plus each document's type, date, and reference,
// exportable as a single index the owner can hand off with their submission.

import type { Building } from "@/lib/data/types";

import type { Deliverable, DeliverableSection } from "./types";

// The standard document types offered on upload. Free text underneath, so the
// vocabulary can grow, but these keep the library consistent.
export const DOC_TYPES: Array<{ value: string; label: string }> = [
  { value: "permit", label: "DOB permit / work application" },
  { value: "prior_ll97_report", label: "Prior LL97 / benchmarking report" },
  { value: "inspection_report", label: "Inspection report" },
  { value: "equipment", label: "Equipment cut sheet / invoice" },
  { value: "plan", label: "Plan / drawing" },
  { value: "lease", label: "Lease / sustainability clause" },
  { value: "correspondence", label: "Agency correspondence" },
  { value: "other", label: "Other" },
];

export function docTypeLabel(value: string): string {
  return DOC_TYPES.find((type) => type.value === value)?.label ?? "Document";
}

export interface LibraryDocument {
  fileName: string;
  docType: string;
  documentDate: string | null;
  referenceNumber: string;
  note: string;
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const parsed = new Date(`${iso}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString("en-US");
}

export function buildDocumentLibraryDeliverable(
  building: Building,
  docs: LibraryDocument[],
  generatedAt: string,
): Deliverable {
  const sections: DeliverableSection[] = [];

  if (docs.length > 0) {
    sections.push({
      heading: "Documents on file",
      table: {
        columns: ["Document", "Type", "Date", "Reference", "Notes"],
        rows: docs.map((doc) => [
          doc.fileName,
          docTypeLabel(doc.docType),
          formatDate(doc.documentDate),
          doc.referenceNumber || "—",
          doc.note || "—",
        ]),
      },
    });
  } else {
    sections.push({
      heading: "Documents on file",
      note: "No documents uploaded yet. Add permits, prior filings, or inspection reports and they'll be indexed here.",
    });
  }

  return {
    kind: "documents",
    title: "Document library",
    purpose: "A standardized index of the documents on file for this building, ready to hand off with any submission.",
    building: { address: building.address, bbl: building.bbl ?? null, bin: building.bin ?? null, sqft: building.sqft },
    stats: [{ label: "Documents", value: String(docs.length), tone: "muted" }],
    sections,
    notes: ["Prepared by Fineprint. Files are stored privately in your account; only you can access them."],
    generatedAt,
  };
}

// The model behind the things Fineprint hands an owner for a building: the LL97
// emissions position, the decarbonization plan, and their standardized document
// library. Each is built entirely from what Fineprint already knows (records +
// the engine) or from files the owner uploaded — nothing to fill in. A Deliverable
// renders as a clean one-page document and exports to CSV, ready to submit wherever
// the owner files for LL97 compliance.

export type DeliverableKind = "emissions" | "decarbonization" | "documents";

export type StatTone = "ok" | "warn" | "bad" | "muted";

export interface DeliverableStat {
  label: string;
  value: string;
  tone?: StatTone;
}

export interface DeliverableRow {
  label: string;
  value: string;
}

export interface DeliverableTable {
  columns: string[];
  rows: string[][];
  note?: string;
}

export interface DeliverableSection {
  heading: string;
  rows?: DeliverableRow[];
  table?: DeliverableTable;
  note?: string;
}

export interface Deliverable {
  kind: DeliverableKind;
  title: string;
  // One line: what this is and where the owner would submit or use it.
  purpose: string;
  building: { address: string; bbl: string | null; bin: string | null; sqft: number };
  // The at-a-glance numbers shown as a stat row and on the summary card.
  stats: DeliverableStat[];
  sections: DeliverableSection[];
  notes: string[];
  generatedAt: string;
}

// A clean, sectioned CSV of a deliverable: a short header block, the at-a-glance
// stats, then each section as label/value rows or a table. Reuses the CSV quoting
// helpers so the export matches the rest of the app.

import { row } from "@/lib/export-compliance";
import { EXPORT_SCHEMA_VERSION } from "@/lib/output/exportEnvelope";

import type { Deliverable } from "./types";

export function deliverableToCsv(deliverable: Deliverable): string {
  const lines: string[] = [];

  lines.push(row([`Fineprint - ${deliverable.title}`]));
  lines.push(row([deliverable.purpose]));
  lines.push(row(["Address", deliverable.building.address]));
  lines.push(row(["BBL", deliverable.building.bbl ?? ""]));
  lines.push(row(["BIN", deliverable.building.bin ?? ""]));
  lines.push(row(["Gross floor area (ft2)", deliverable.building.sqft]));
  lines.push(row(["Prepared", deliverable.generatedAt]));
  lines.push(row(["Schema version", EXPORT_SCHEMA_VERSION]));
  lines.push("");

  if (deliverable.stats.length > 0) {
    lines.push(row(["Summary"]));
    for (const stat of deliverable.stats) {
      lines.push(row([stat.label, stat.value]));
    }
    lines.push("");
  }

  for (const section of deliverable.sections) {
    lines.push(row([section.heading]));

    for (const item of section.rows ?? []) {
      lines.push(row([item.label, item.value]));
    }

    if (section.table) {
      lines.push(row(section.table.columns));
      for (const tableRow of section.table.rows) {
        lines.push(row(tableRow));
      }
      if (section.table.note) {
        lines.push(row([section.table.note]));
      }
    }

    if (section.note) {
      lines.push(row([section.note]));
    }
    lines.push("");
  }

  if (deliverable.notes.length > 0) {
    lines.push(row(["Notes"]));
    for (const note of deliverable.notes) {
      lines.push(row([note]));
    }
  }

  return lines.join("\n");
}

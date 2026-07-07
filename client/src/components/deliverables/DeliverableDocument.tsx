"use client";

import type { Deliverable, DeliverableSection, StatTone } from "@/lib/deliverables/types";
import { cn } from "@/lib/utils";

// Renders a Deliverable as a clean, print-ready one-page document. A letterhead
// header, an at-a-glance stat row, then tidy sections. No form boxes and no blanks
// to fill, since everything shown is already prepared.

const TONE_CLASS: Record<StatTone, string> = {
  ok: "text-success",
  warn: "text-amber-600 dark:text-amber-500",
  bad: "text-destructive",
  muted: "text-foreground",
};

function StatRow({ deliverable }: { deliverable: Deliverable }) {
  if (deliverable.stats.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border bg-muted/20 px-4 py-3">
      {deliverable.stats.map((stat) => (
        <div key={stat.label} className="min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{stat.label}</p>
          <p className={cn("font-semibold text-base tabular-nums", TONE_CLASS[stat.tone ?? "muted"])}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

function Section({ section }: { section: DeliverableSection }) {
  return (
    <section className="space-y-2">
      <h4 className="border-border border-b pb-1 font-semibold text-sm tracking-tight">{section.heading}</h4>

      {section.rows && section.rows.length > 0 ? (
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
          {section.rows.map((entry) => (
            <div key={entry.label} className="flex justify-between gap-3 border-border/50 border-b border-dashed pb-1">
              <dt className="text-muted-foreground text-xs">{entry.label}</dt>
              <dd className="text-right font-medium text-xs">{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {section.table ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b text-left text-[10px] text-muted-foreground uppercase tracking-wide">
                {section.table.columns.map((column) => (
                  <th key={column} className="py-1.5 pr-4 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((tableRow, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are a fixed positional list.
                <tr key={index} className="border-b align-top last:border-0">
                  {tableRow.map((cell, cellIndex) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional within a row.
                    <td key={cellIndex} className="py-1.5 pr-4 tabular-nums">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {section.table?.note ? <p className="text-[10px] text-muted-foreground">{section.table.note}</p> : null}
      {section.note ? <p className="text-muted-foreground text-xs">{section.note}</p> : null}
    </section>
  );
}

export function DeliverableDocument({ deliverable }: { deliverable: Deliverable }) {
  return (
    <div className="deliverable-doc space-y-5 text-foreground text-sm">
      <header className="space-y-1 border-border border-b pb-3">
        <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.15em]">Fineprint</p>
        <h3 className="font-bold font-heading text-lg tracking-tight">{deliverable.title}</h3>
        <p className="text-muted-foreground text-xs">
          {deliverable.building.address}
          {deliverable.building.bbl ? ` · BBL ${deliverable.building.bbl}` : ""}
          {deliverable.building.bin ? ` · BIN ${deliverable.building.bin}` : ""}
        </p>
        <p className="text-muted-foreground text-xs italic">{deliverable.purpose}</p>
        <p className="text-[11px] text-muted-foreground">
          Prepared {new Date(deliverable.generatedAt).toLocaleDateString()}
        </p>
      </header>

      <StatRow deliverable={deliverable} />

      {deliverable.sections.map((section) => (
        <Section key={section.heading} section={section} />
      ))}

      {deliverable.notes.length > 0 ? (
        <section className="space-y-1 border-border border-t pt-3">
          {deliverable.notes.map((note) => (
            <p key={note} className="text-[10px] text-muted-foreground">
              {note}
            </p>
          ))}
        </section>
      ) : null}
    </div>
  );
}

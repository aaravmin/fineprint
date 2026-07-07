import type { ComplianceReport } from "@/lib/output/complianceReportTemplate";

// Assumptions/limitations and the source appendix — the disclosure every
// professional deliverable carries, so figures can be traced and verified.
export function SourceAppendix({ report }: { report: ComplianceReport }) {
  return (
    <section className="space-y-4 border-t pt-4">
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold tracking-tight">Assumptions and limitations</h3>
        <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          {report.assumptions_and_limitations.map((item) => (
            <li key={item} className="flex gap-2">
              <span>—</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold tracking-tight">Source appendix</h3>
        <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          {report.source_citations.map((citation) => (
            <li key={`${citation.dataset}:${citation.identifier ?? ""}:${citation.as_of}:${citation.fields.join("|")}`}>
              <span className="font-medium text-foreground/80">{citation.dataset}</span>
              {citation.identifier ? ` · ${citation.identifier}` : ""} · {citation.as_of}
              <div className="text-[11px]">Backs: {citation.fields.join(", ")}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground/80">Professional verification</p>
        <p className="mt-1">
          This report is an owner/property-manager record, not a filed report or a legal determination of compliance.
          The emissions calculation and any filing decision require verification by a Registered Design Professional
          before submission to the NYC Department of Buildings.
        </p>
        <p className="mt-2 tabular-nums">
          Schema {report.schema_version} · generated {new Date(report.generated_at).toLocaleString()}
        </p>
      </div>
    </section>
  );
}

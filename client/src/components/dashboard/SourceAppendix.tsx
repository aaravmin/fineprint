import type { ComplianceReport } from "@/lib/output/complianceReportTemplate";

// Assumptions/limitations and the source appendix — the disclosure every
// professional deliverable carries, so figures can be traced and verified.
export function SourceAppendix({ report }: { report: ComplianceReport }) {
  const block = (title: string, items: string[]) => (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span>—</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section className="space-y-4 border-t pt-4">
      {block("Assumptions and limitations", report.assumptions_and_limitations)}
      {block("Source appendix", report.source_appendix)}
      <p className="text-[11px] text-muted-foreground">
        Generated {new Date(report.generated_at).toLocaleString()}. This is an owner record, not a
        filed report; professional verification is recommended before filing or capital decisions.
      </p>
    </section>
  );
}

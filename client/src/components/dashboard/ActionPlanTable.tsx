import type { ComplianceReport } from "@/lib/output/complianceReportTemplate";

// The prioritized action plan: immediate filings, near-term and capital
// measures, and recurring cycle obligations. Imperative, bounded actions.
export function ActionPlanTable({ report }: { report: ComplianceReport }) {
  const plan = report.action_plan;
  const group = (title: string, items: string[]) =>
    items.length === 0 ? null : (
      <div key={title}>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <ul className="space-y-1 text-sm leading-relaxed">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted-foreground">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );

  const sections = [
    group("Immediate", plan.immediate),
    group("Near-term (30–90 days)", plan.near_term),
    group("Capital planning", plan.capital_planning),
    group("Annual / recurring", plan.recurring),
  ].filter(Boolean);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold tracking-tight">Prioritized action plan</h3>
      {sections.length > 0 ? (
        <div className="space-y-4">{sections}</div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No immediate filing actions identified based on available records.
        </p>
      )}
    </section>
  );
}

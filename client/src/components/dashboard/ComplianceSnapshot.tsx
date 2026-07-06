import { fmtUsd } from "@/lib/engine";
import type { ComplianceReport } from "@/lib/output/complianceReportTemplate";

// The executive summary: the few numbers a reviewer reads first. Flat and
// records-based, never reassuring.
export function ComplianceSnapshot({ report }: { report: ComplianceReport }) {
  const snapshot = report.compliance_snapshot;

  const stat = (label: string, value: string, tone?: string) => (
    <div className="rounded-xl border bg-background px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold tracking-tight">Compliance snapshot</h3>
      <div className="grid grid-cols-2 gap-3 @sm/main:grid-cols-4">
        {stat("Applicable requirements", String(snapshot.applicable.length))}
        {stat(
          "Estimated annual exposure",
          snapshot.estimated_annual_exposure_usd > 0 ? fmtUsd(snapshot.estimated_annual_exposure_usd) : "None modeled",
          snapshot.estimated_annual_exposure_usd > 0 ? "text-destructive" : undefined,
        )}
        {stat("Nearest deadline", snapshot.nearest_deadline ?? "Not dated")}
        {stat(
          "Requirements with missing data",
          String(snapshot.missing_data.length),
          snapshot.missing_data.length > 0 ? "text-amber-500" : undefined,
        )}
      </div>
      {snapshot.highest_risk.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Highest-risk items: </span>
          {snapshot.highest_risk.join(" · ")}
        </div>
      )}
    </section>
  );
}

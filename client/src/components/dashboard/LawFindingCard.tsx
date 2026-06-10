import { Badge } from "@/components/ui/badge";
import type { ReportFinding } from "@/lib/output/complianceReportTemplate";

const STATUS_TONE: Record<string, string> = {
  applies: "text-foreground",
  may_apply: "text-amber-600",
  does_not_apply: "text-muted-foreground",
  unknown: "text-muted-foreground",
  missing_data: "text-amber-600",
};

// One requirement, requirement by requirement: status, why it applies, the
// requirement, deadline, exposure, source/missing data, and the next action.
export function LawFindingCard({ finding }: { finding: ReportFinding }) {
  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div className="space-y-2 rounded-xl border bg-background px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">
          <span className="font-mono text-xs text-muted-foreground">{finding.short}</span>{" "}
          {finding.law}
        </p>
        <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[finding.status] ?? ""}`}>
          {finding.status_label}
        </Badge>
      </div>

      {field("Requirement", finding.requirement)}
      {field(
        "Next deadline",
        finding.next_deadline ?? finding.cadence ?? "Not dated from available records",
      )}
      {field("Estimated exposure", finding.estimated_exposure)}
      {finding.missing_data.length > 0 && (
        <div className="grid grid-cols-[8.5rem_1fr] gap-2 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Missing data</span>
          <span className="text-amber-600">{finding.missing_data.join(", ")}</span>
        </div>
      )}
      {field("Recommended action", finding.recommended_action)}
    </div>
  );
}

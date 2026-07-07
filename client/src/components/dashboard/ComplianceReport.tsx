"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tables } from "@/lib/db";
import { useTable } from "@/lib/db/react";
import type { Building } from "@/lib/db/types";
import { fmtUsd, type RetrofitAssessment } from "@/lib/engine";
import { projectionFor } from "@/lib/law-projections";
import { lawsInOrder } from "@/lib/laws/lawRegistry";
import {
  buildComplianceReport,
  type FindingStatus,
  type ReportFindingInput,
  type ReportRecommendationInput,
} from "@/lib/output/complianceReportTemplate";
import { MASTER_MEASURES } from "@/lib/output/masterMeasures";

import { ActionPlanTable } from "./ActionPlanTable";
import { ComplianceSnapshot } from "./ComplianceSnapshot";
import { LawFindingCard } from "./LawFindingCard";
import { SourceAppendix } from "./SourceAppendix";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fieldPresent = (building: Building, key: string) => (building as unknown as Record<string, unknown>)[key] != null;

// Build a professional compliance report from the live building + its tasks, and
// render it as a print-ready, consultant-style deliverable.
export function ComplianceReport({
  building,
  assessment,
}: {
  building: Building;
  assessment: RetrofitAssessment | null;
}) {
  const [tasks] = useTable(tables.task);
  const buildingTasks = tasks.filter((task) => task.buildingId === building.id);

  const findings: ReportFindingInput[] = lawsInOrder()
    .filter((law) => law.law_id !== "ll96" && law.law_id !== "art321")
    .map((law) => {
      const task = buildingTasks.find((candidate) => candidate.lawId === law.law_id);
      const missing = law.source_data_keys.filter((key) => !fieldPresent(building, key));
      const used = law.source_data_keys.filter((key) => fieldPresent(building, key));

      // A task means the law binds this building. With no task: missing source
      // data means we can't confirm it; complete data means it does not apply.
      const status: FindingStatus = task ? "applies" : missing.length > 0 ? "missing_data" : "does_not_apply";

      return {
        lawId: law.law_id,
        status,
        nextDeadline: task ? iso(task.deadline) : null,
        cadence: projectionFor(law.law_id)?.cadence ?? null,
        estimatedExposureUsd: task?.fineEstimateUsd ?? null,
        sourceDataUsed: used,
        missingData: missing,
      };
    });

  // Recommendations come from the Phase 5 master measures whose laws bind this
  // building (real cost ranges + savings), falling back to the engine's
  // marginal-abatement curve only if the master module is empty.
  const applicableLawIds = new Set(buildingTasks.map((task) => task.lawId));
  const lighter = new Set(["Envelope", "Water heating"]);
  const masterRecs: ReportRecommendationInput[] = MASTER_MEASURES.filter((measure) =>
    measure.supports_law_ids.some((id) => applicableLawIds.has(id)),
  ).map((measure) => ({
    measure: measure.measure_name,
    issueAddressed: measure.supports_law_ids.includes("ll97")
      ? "Reduces LL97 emissions and over-cap exposure"
      : "Supports the building's filing obligations",
    lawIds: measure.supports_law_ids,
    costLowUsd: measure.cost_low,
    costHighUsd: measure.cost_high,
    costUnit: measure.cost_unit,
    annualSavingsUsd: measure.annual_utility_savings_mid,
    annualEnergySavings:
      measure.annual_energy_savings_mid !== null
        ? `${Math.round(measure.annual_energy_savings_mid).toLocaleString()} kWh/yr`
        : null,
    priority: lighter.has(measure.category ?? "") ? "Near-term" : "Capital planning",
    source: `${measure.cost_source ?? "—"} cost / ${measure.savings_source ?? "—"} savings · ${measure.confidence_level ?? "?"} confidence`,
  }));

  const maccRecs: ReportRecommendationInput[] = (assessment?.macc ?? [])
    .filter((point) => Number.isFinite(point.usdPerTco2e) && point.annualReductionTco2e > 0)
    .slice(0, 5)
    .map((point, index) => ({
      measure: point.name,
      issueAddressed: "Reduces LL97 emissions and over-cap exposure",
      lawIds: ["ll97"],
      costLowUsd: null,
      costHighUsd: null,
      costUnit: `${fmtUsd(point.usdPerTco2e)}/tCO₂e abated`,
      annualSavingsUsd: null,
      annualEnergySavings: `${point.annualReductionTco2e.toLocaleString()} tCO₂e/yr`,
      priority: index < 2 ? "Near-term" : "Capital planning",
      source: point.basis,
    }));

  const recommendations = masterRecs.length > 0 ? masterRecs : maccRecs;

  const report = buildComplianceReport({
    building: {
      address: building.address,
      bbl: building.bbl ?? null,
      bin: building.bin ?? null,
      sqft: building.sqft,
      buildingType: null,
      yearBuilt: null,
      primaryUse: null,
    },
    findings,
    recommendations,
    binder: null,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Compliance report</CardTitle>
          <Button type="button" size="sm" variant="outline" className="print-hide" onClick={() => window.print()}>
            <Printer className="mr-1 size-3.5" /> Print / PDF
          </Button>
        </div>
        <div className="space-y-0.5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{report.building_summary.address}</p>
          <p className="tabular-nums">
            {report.building_identifiers.bbl ? `BBL ${report.building_identifiers.bbl}` : "BBL —"}
            {report.building_identifiers.bin ? ` · BIN ${report.building_identifiers.bin}` : ""} ·{" "}
            {report.building_summary.sqft.toLocaleString()} ft²
          </p>
          <p className="text-xs">
            Prepared by Fineprint · {new Date(report.generated_at).toLocaleDateString()} · {report.schema_version}
          </p>
        </div>
      </CardHeader>
      <CardContent className="compliance-report space-y-6">
        <ComplianceSnapshot report={report} />

        <section className="space-y-3">
          <h3 className="text-sm font-semibold tracking-tight">Law-by-law findings</h3>
          <div className="space-y-2.5">
            {report.findings
              .filter((finding) => finding.status === "applies")
              .map((finding) => (
                <LawFindingCard key={finding.law_id} finding={finding} />
              ))}
          </div>
        </section>

        {report.findings.some((finding) => finding.status !== "applies") && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold tracking-tight">Not tracked for this building</h3>
            <ul className="space-y-1 text-sm leading-relaxed">
              {report.findings
                .filter((finding) => finding.status !== "applies")
                .map((finding) => (
                  <li key={finding.law_id} className="flex gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{finding.short}</span>
                    <span className="text-muted-foreground">{finding.not_tracked_reason}</span>
                  </li>
                ))}
            </ul>
          </section>
        )}

        {report.recommendations.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight">Retrofit / corrective action recommendations</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Measure</th>
                    <th className="py-2 pr-4 font-medium">Estimated cost</th>
                    <th className="py-2 pr-4 font-medium">Annual savings</th>
                    <th className="py-2 pr-4 font-medium">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {report.recommendations.map((rec) => (
                    <tr key={`${rec.measure}:${rec.source}`} className="border-b align-top last:border-0">
                      <td className="py-2 pr-4">
                        {rec.measure}
                        <div className="text-xs text-muted-foreground">{rec.source}</div>
                      </td>
                      <td className="py-2 pr-4 tabular-nums">
                        {rec.costLowUsd !== null && rec.costHighUsd !== null
                          ? `${fmtUsd(rec.costLowUsd)}–${fmtUsd(rec.costHighUsd)}`
                          : (rec.costUnit ?? "—")}
                        {rec.costLowUsd !== null && rec.costUnit && (
                          <div className="text-xs text-muted-foreground">{rec.costUnit}</div>
                        )}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">
                        {[
                          rec.annualEnergySavings,
                          rec.annualSavingsUsd !== null ? `${fmtUsd(rec.annualSavingsUsd)}/yr` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td className="py-2 pr-4">{rec.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Preliminary recommendations, not final engineering scopes. Cost and savings are sourced estimates for
              typical buildings.
            </p>
          </section>
        )}

        <ActionPlanTable report={report} />
        <SourceAppendix report={report} />
      </CardContent>
    </Card>
  );
}

"use client";

import { Printer } from "lucide-react";
import { useTable } from "spacetimedb/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtUsd, type RetrofitAssessment } from "@/lib/engine";
import { lawsInOrder } from "@/lib/laws/lawRegistry";
import { projectionFor } from "@/lib/law-projections";
import {
  buildComplianceReport,
  type FindingStatus,
  type ReportFindingInput,
  type ReportRecommendationInput,
} from "@/lib/output/complianceReportTemplate";
import { tables } from "@/module_bindings/index";
import type { Building } from "@/module_bindings/types";

import { ActionPlanTable } from "./ActionPlanTable";
import { ComplianceSnapshot } from "./ComplianceSnapshot";
import { LawFindingCard } from "./LawFindingCard";
import { SourceAppendix } from "./SourceAppendix";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fieldPresent = (building: Building, key: string) =>
  (building as unknown as Record<string, unknown>)[key] != null;

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
  const buildingTasks = tasks.filter(task => task.buildingId === building.id);

  const findings: ReportFindingInput[] = lawsInOrder()
    .filter(law => law.law_id !== "ll96" && law.law_id !== "art321")
    .map(law => {
      const task = buildingTasks.find(candidate => candidate.lawId === law.law_id);
      const missing = law.source_data_keys.filter(key => !fieldPresent(building, key));
      const used = law.source_data_keys.filter(key => fieldPresent(building, key));

      // A task means the law binds this building. With no task: missing source
      // data means we can't confirm it; complete data means it does not apply.
      const status: FindingStatus = task
        ? "applies"
        : missing.length > 0
          ? "missing_data"
          : "does_not_apply";

      return {
        lawId: law.law_id,
        status,
        nextDeadline: task ? iso(task.deadline.toDate()) : null,
        cadence: projectionFor(law.law_id)?.cadence ?? null,
        estimatedExposureUsd: task?.fineEstimateUsd ?? null,
        sourceDataUsed: used,
        missingData: missing,
      };
    });

  const recommendations: ReportRecommendationInput[] = (assessment?.macc ?? [])
    .filter(point => Number.isFinite(point.usdPerTco2e) && point.annualReductionTco2e > 0)
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

  const report = buildComplianceReport({
    building: {
      address: building.address,
      bbl: building.bbl ?? null,
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="print-hide"
            onClick={() => window.print()}
          >
            <Printer className="mr-1 size-3.5" /> Print / PDF
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {report.building_summary.address}
          {report.building_summary.bbl ? ` · BBL ${report.building_summary.bbl}` : ""} ·{" "}
          {report.building_summary.sqft.toLocaleString()} ft²
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <ComplianceSnapshot report={report} />

        <section className="space-y-3">
          <h3 className="text-sm font-semibold tracking-tight">Law-by-law findings</h3>
          <div className="space-y-2.5">
            {report.findings
              .filter(finding => finding.status === "applies")
              .map(finding => (
                <LawFindingCard key={finding.law_id} finding={finding} />
              ))}
          </div>
        </section>

        {report.findings.some(finding => finding.status !== "applies") && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold tracking-tight">Not tracked for this building</h3>
            <ul className="space-y-1 text-sm leading-relaxed">
              {report.findings
                .filter(finding => finding.status !== "applies")
                .map(finding => (
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
            <h3 className="text-sm font-semibold tracking-tight">
              Retrofit / corrective action recommendations
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Measure</th>
                    <th className="py-2 pr-4 font-medium">Annual impact</th>
                    <th className="py-2 pr-4 font-medium">Cost basis</th>
                    <th className="py-2 pr-4 font-medium">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {report.recommendations.map((rec, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-4">{rec.measure}</td>
                      <td className="py-2 pr-4 tabular-nums">{rec.annualEnergySavings}</td>
                      <td className="py-2 pr-4 tabular-nums">{rec.costUnit}</td>
                      <td className="py-2 pr-4">{rec.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Preliminary recommendations, not final engineering scopes. Cost and savings are sourced
              estimates for typical buildings.
            </p>
          </section>
        )}

        <ActionPlanTable report={report} />
        <SourceAppendix report={report} />
      </CardContent>
    </Card>
  );
}

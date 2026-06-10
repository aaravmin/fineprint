"use client";

import { useMemo, useState } from "react";

import { BookOpenCheck, Download, Flame, Leaf, Printer, Ruler } from "lucide-react";
import { useTable } from "spacetimedb/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeFundedPlan,
  computePeriods,
  computeRetrofit,
  fmtTco2e,
  fmtUsd,
  measureFullCosts,
  type FineResult,
} from "@/lib/engine";
import {
  buildComplianceCsv,
  downloadCsv,
  slugForBuilding,
  type LawExposureRow,
} from "@/lib/export-compliance";
import { LAW_REGISTRY, lawsInOrder } from "@/lib/laws/lawRegistry";
import { projectionFor } from "@/lib/law-projections";
import { tables } from "@/module_bindings/index";
import type { Building } from "@/module_bindings/types";

import { ComplianceBinder } from "@/components/compliance/ComplianceBinder";
import { ComplianceReport } from "@/components/dashboard/ComplianceReport";

import { ComplianceSection, STATUS_DOT } from "./compliance-section";
import { FineTimeline } from "./fine-timeline";
import { InvestmentPlanner } from "./investment-planner";
import { LawPanel } from "./law-panel";

// A scope is "all" or any registry law_id. Tabs and tracked scopes are derived
// from the canonical registry, so a new law shows up here automatically.
type LawScope = string;

// Article 321 rides inside the LL97 tab (same emissions pathway), so it gets no
// pill of its own here. Every other registry law is a focused tab.
const LAW_TABS: { id: LawScope; label: string }[] = [
  { id: "all", label: "All laws" },
  ...lawsInOrder()
    .filter(law => law.law_id !== "art321")
    .map(law => ({ id: law.law_id, label: law.short_name })),
];

// LL97 has its own emissions-and-fines view; every other registry law (besides
// the art321 pathway folded into LL97) is a filing/inspection tracked on its tab.
const TRACKED_SCOPES = new Set<LawScope>(
  lawsInOrder()
    .filter(law => law.law_id !== "ll97" && law.law_id !== "art321")
    .map(law => law.law_id),
);

// The whole building compliance view, behind a law toggle, reused by both the
// single-building page and the Buildings selector. Funding state lives here so
// the chart, the planner, and the export all read one set of numbers.
export function ComplianceDashboard({ building }: { building: Building }) {
  const [tasks] = useTable(tables.task);
  const [scope, setScope] = useState<LawScope>("all");

  const periods = useMemo(() => computePeriods(building), [building]);
  const assessment = useMemo(() => computeRetrofit(building), [building]);

  // Default the planner to the optimizer's pick, fully funded.
  const [funding, setFunding] = useState<Record<string, number>>(() => {
    if (!assessment) return {};
    const picks = new Set(assessment.best.measureIds);
    const costs = measureFullCosts(building);
    return Object.fromEntries(
      Object.entries(costs).map(([id, cost]) => [id, picks.has(id) ? cost : 0]),
    );
  });

  const fundedPlan = useMemo(
    () => computeFundedPlan(building, funding),
    [building, funding],
  );

  const buildingTasks = tasks.filter(task => task.buildingId === building.id);
  const lawRows: LawExposureRow[] = LAW_REGISTRY.filter(
    law => law.law_id !== "art321" && law.law_id !== "ll96",
  ).map(
    law => {
      const task = buildingTasks.find(candidate => candidate.lawId === law.law_id);
      return {
        short: law.short_name,
        name: law.display_name,
        status: task?.status ?? "missing",
        exposureUsd: task?.fineEstimateUsd,
      };
    },
  );

  const exportCsv = () => {
    const csv = buildComplianceCsv(building, fundedPlan, lawRows);
    downloadCsv(`fineprint-${slugForBuilding(building)}.csv`, csv);
  };

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <BuildingHeader building={building} />

      <div className="flex flex-wrap items-center justify-between gap-3 print-hide">
        <div className="flex flex-wrap gap-1.5">
          {LAW_TABS.map(tab => (
            <Button
              key={tab.id}
              type="button"
              size="sm"
              variant={scope === tab.id ? "default" : "outline"}
              onClick={() => setScope(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-1 size-3.5" /> CSV
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 size-3.5" /> Print / PDF
          </Button>
        </div>
      </div>

      {scope === "all" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Exposure by law</CardTitle>
              <p className="text-sm text-muted-foreground">
                Estimated annual exposure per law, colored by where the filing stands.
              </p>
            </CardHeader>
            <CardContent>
              <ExposureByLaw rows={lawRows} />
            </CardContent>
          </Card>

          <ComplianceReport building={building} assessment={assessment} />
          <CompliancePlanCard planJson={building.compliancePlanJson} />
          <ComplianceSection buildingId={building.id} />
          <ComplianceBinder building={building} />
          <ProvenanceFootnotes provenanceJson={building.provenanceJson} />
        </>
      )}

      {scope === "ll97" &&
        (periods && fundedPlan && assessment ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Fine projection</CardTitle>
                <p className="text-sm text-muted-foreground">
                  LL97 fines through 2039 at the funding below — move the planner to watch
                  them fall.
                </p>
              </CardHeader>
              <CardContent>
                <FineTimeline periods={fundedPlan.results} />
              </CardContent>
            </Card>

            <PlainEnglishCard periods={periods} address={building.address} />

            <InvestmentPlanner
              building={building}
              plan={fundedPlan}
              assessment={assessment}
              funding={funding}
              onFundingChange={setFunding}
            />
          </>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No energy data yet. Run the ingest pipeline to pull real LL84 data and unlock
              the LL97 projection.
            </CardContent>
          </Card>
        ))}

      {TRACKED_SCOPES.has(scope) &&
        (() => {
          const law = LAW_REGISTRY.find(entry => entry.law_id === scope);
          const projection = projectionFor(scope);
          const task = buildingTasks.find(candidate => candidate.lawId === scope);

          return (
            <>
              {scope === "ll33" && <EnergyGradeCard score={building.energyStarScore} />}
              {law && projection && (
                <LawPanel lawName={law.display_name} projection={projection} task={task} />
              )}
              {scope !== "ll96" && (
                <ComplianceSection buildingId={building.id} onlyLawId={scope} />
              )}
            </>
          );
        })()}
    </div>
  );
}

// The LL33 letter grade for an ENERGY STAR score, per the statutory LL33/LL95
// bands (Admin Code 28-309.12.2). Mirrors energyGradeForScore in
// spacetimedb/src/laws.ts. undefined means the building has no score on file.
function energyGradeFor(score: number | undefined): { grade: string; tone: string } {
  if (score === undefined) {
    return { grade: "N", tone: "text-muted-foreground" };
  }
  if (score >= 85) return { grade: "A", tone: "text-success" };
  if (score >= 70) return { grade: "B", tone: "text-success" };
  if (score >= 55) return { grade: "C", tone: "text-amber-500" };
  if (score >= 20) return { grade: "D", tone: "text-destructive" };
  return { grade: "F", tone: "text-destructive" };
}

// The building's posted LL33 grade, read straight from its latest LL84 ENERGY
// STAR score. An unscored building posts an "N" until a benchmarking score is
// on file.
function EnergyGradeCard({ score }: { score: number | undefined }) {
  const { grade, tone } = energyGradeFor(score);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Energy grade</CardTitle>
        <p className="text-sm text-muted-foreground">
          The letter grade this building must post near every public entrance, set by its
          latest LL84 ENERGY STAR score.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <span className={`text-6xl font-bold tabular-nums ${tone}`}>{grade}</span>
          <div className="text-sm text-muted-foreground">
            {score === undefined ? (
              <p>
                No ENERGY STAR score on file yet — the grade is{" "}
                <span className="font-medium">N</span> until a benchmarking score is
                reported.
              </p>
            ) : (
              <p>
                ENERGY STAR score{" "}
                <span className="font-medium text-foreground tabular-nums">{score}</span> out
                of 100.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// A horizontal exposure bar per law: bar length is the dollar exposure, bar
// color is the filing status (same palette as the per-law ledger dots).
function ExposureByLaw({ rows }: { rows: LawExposureRow[] }) {
  const max = Math.max(1, ...rows.map(row => row.exposureUsd ?? 0));

  return (
    <div className="space-y-2.5">
      {rows.map(row => {
        const value = row.exposureUsd ?? 0;
        const width = value > 0 ? Math.max(4, (value / max) * 100) : 0;

        return (
          <div
            key={row.short}
            className="grid grid-cols-[4.5rem_1fr_6rem] items-center gap-3"
          >
            <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <span
                className={`size-1.5 rounded-full ${STATUS_DOT[row.status] ?? "bg-muted-foreground/40"}`}
              />
              {row.short}
            </span>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${STATUS_DOT[row.status] ?? "bg-muted-foreground/40"}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="text-right text-xs tabular-nums text-muted-foreground">
              {value > 0 ? `${fmtUsd(value)}/yr` : "tracked"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BuildingHeader({ building }: { building: Building }) {
  const uses: Array<{ group: string; sqft: number }> = building.usesJson
    ? JSON.parse(building.usesJson)
    : [];

  const ll97Status =
    building.ll97Covered === true
      ? building.isAffordable
        ? "Article 321"
        : "LL97 Covered"
      : building.ll97Covered === false
        ? "LL97 Exempt"
        : "LL97 Unknown";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{building.address}</CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {building.bbl && <span className="font-mono text-xs">BBL {building.bbl}</span>}
              <span className="inline-flex items-center gap-1">
                <Ruler className="size-3.5" />
                {building.sqft.toLocaleString()} sqft
              </span>
            </div>
            {uses.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {uses.map(use => (
                  <Badge key={use.group} variant="outline" className="text-xs">
                    {use.group} / {use.sqft.toLocaleString()} sqft
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={building.ll97Covered ? "destructive" : "secondary"}>
              <Flame className="mr-1 size-3" />
              {ll97Status}
            </Badge>
            {building.annualEmissionsTco2E !== undefined && (
              <Badge variant="outline">
                <Leaf className="mr-1 size-3" />
                {fmtTco2e(building.annualEmissionsTco2E)}/yr
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

function PlainEnglishCard({
  periods,
  address,
}: {
  periods: FineResult[];
  address: string;
}) {
  const current = periods[0];
  const p2030 = periods[1];
  const p2035 = periods[2];
  const isArticle321 = current.pathway === "article321";
  const cliffRatio =
    current.annualFineUsd > 0
      ? (p2030.annualFineUsd / current.annualFineUsd).toFixed(1)
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plain English</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed">
        {isArticle321 ? (
          <p>
            <span className="font-medium">{address}</span> qualifies for the LL97 Article
            321 affordable housing pathway. It must implement the prescribed energy
            conservation measures (Admin Code 28-321.2.2) or meet its 2030 target of{" "}
            <span className="font-medium text-success">
              {fmtTco2e(current.emissionsLimitTco2e)}
            </span>{" "}
            early. Non-compliance draws flat $10,000 penalties — not modeled here.
          </p>
        ) : current.compliant ? (
          <p>
            <span className="font-medium">{address}</span> is compliant across all three
            LL97 periods. Its emissions of{" "}
            <span className="font-medium">{fmtTco2e(current.actualEmissionsTco2e)}</span>{" "}
            stay below the 2024–2029 cap of{" "}
            <span className="font-medium text-success">
              {fmtTco2e(current.emissionsLimitTco2e)}
            </span>
            .
          </p>
        ) : (
          <>
            <p>
              <span className="font-medium">{address}</span> emits{" "}
              <span className="font-medium">{fmtTco2e(current.actualEmissionsTco2e)}</span>
              /year against a 2024–2029 cap of{" "}
              <span className="font-medium">{fmtTco2e(current.emissionsLimitTco2e)}</span>.
              The{" "}
              <span className="font-medium text-destructive">
                {fmtTco2e(current.overageTco2e)} overage
              </span>{" "}
              costs{" "}
              <span className="font-medium text-destructive">
                {fmtUsd(current.annualFineUsd)}/year
              </span>{" "}
              at $268/tCO₂e.¹
            </p>
            {p2030.annualFineUsd > 0 && (
              <p>
                In 2030, the cap tightens. With the same emissions, the fine jumps to{" "}
                <span className="font-medium text-destructive">
                  {fmtUsd(p2030.annualFineUsd)}/year
                </span>
                {cliffRatio && Number(cliffRatio) > 1.1 ? ` — a ${cliffRatio}× increase` : ""}.
                By 2035 it reaches{" "}
                <span className="font-medium text-destructive">
                  {fmtUsd(p2035.annualFineUsd)}/year
                </span>
                .
              </p>
            )}
            <p>
              The fastest path to $0: close the{" "}
              <span className="font-medium">{fmtTco2e(current.overageTco2e)}</span> gap
              before 2030 — size it in the LL97 investment planner.
            </p>
          </>
        )}

        <div className="space-y-1 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            ¹ 1 RCNY 103-14(h) — penalty at $268/tCO₂e over the building emissions limit.
          </p>
          <p className="text-xs text-muted-foreground">
            ² Admin Code 28-320.3 — building emissions limits by occupancy group.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface PlanMeasure {
  id: string;
  name: string;
  capexUsd: number;
  alsoSatisfies: string[];
}

interface PlanDisposition {
  lawId: string;
  lawName: string;
  kind: "performance" | "procedural";
  status: string;
  handledBy: string;
  detail: string;
}

interface StoredCompliancePlan {
  pathway: "standard" | "article321" | null;
  measures: PlanMeasure[];
  totalCapexUsd: number;
  dispositions: PlanDisposition[];
  crossCredits: string[];
  notes: string[];
}

const HANDLING_LABEL: Record<string, string> = {
  retrofit_measures: "Retrofit plan",
  filing: "File",
  already_compliant: "Compliant",
  needs_attention: "Needs attention",
};

const HANDLING_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  retrofit_measures: "default",
  filing: "outline",
  already_compliant: "secondary",
  needs_attention: "destructive",
};

// The data layer's whole-building plan, serialized at intake. Every obligation
// appears exactly once; a measure that retires several laws is shown once with
// its cross-credits.
function CompliancePlanCard({ planJson }: { planJson: string | undefined }) {
  if (!planJson) {
    return null;
  }

  let plan: StoredCompliancePlan;
  try {
    plan = JSON.parse(planJson);
  } catch {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Compliance plan</CardTitle>
          <div className="flex items-center gap-2">
            {plan.pathway && (
              <Badge variant="outline">
                {plan.pathway === "article321"
                  ? "Article 321 pathway"
                  : "Standard pathway"}
              </Badge>
            )}
            {plan.totalCapexUsd > 0 && (
              <Badge variant="secondary" className="tabular-nums">
                {fmtUsd(plan.totalCapexUsd)} capex
              </Badge>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          One plan covering every law — each obligation disposed of exactly once.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {plan.measures.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Chosen measures
            </p>
            <div className="mt-2 divide-y rounded-xl border">
              {plan.measures.map(measure => (
                <div
                  key={measure.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <span className="text-sm font-medium">{measure.name}</span>
                  <span className="flex items-center gap-2">
                    {measure.alsoSatisfies.map(lawId => (
                      <Badge key={lawId} variant="outline" className="text-xs">
                        also clears {lawId.toUpperCase()}
                      </Badge>
                    ))}
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {fmtUsd(measure.capexUsd)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Dispositions
          </p>
          <div className="mt-2 divide-y rounded-xl border">
            {plan.dispositions.map(disposition => (
              <div key={disposition.lawId} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{disposition.lawName}</span>
                  <Badge
                    variant={HANDLING_VARIANT[disposition.handledBy] ?? "secondary"}
                    className="text-xs"
                  >
                    {HANDLING_LABEL[disposition.handledBy] ?? disposition.handledBy}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {disposition.kind} / {disposition.status.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {disposition.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        {plan.crossCredits.length > 0 && (
          <div className="rounded-xl bg-secondary px-4 py-3">
            {plan.crossCredits.map(credit => (
              <p key={credit} className="flex items-start gap-2 text-xs text-foreground/80">
                <BookOpenCheck className="mt-0.5 size-3.5 shrink-0" />
                {credit}
              </p>
            ))}
          </div>
        )}

        {plan.notes.length > 0 && (
          <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
            {plan.notes.join(" ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface ProvenanceNote {
  field: string;
  source: string;
  detail?: string;
}

// Every fact's source, as footnotes — the honesty contract made visible.
function ProvenanceFootnotes({ provenanceJson }: { provenanceJson: string | undefined }) {
  if (!provenanceJson) {
    return null;
  }

  let notes: ProvenanceNote[];
  try {
    notes = JSON.parse(provenanceJson);
  } catch {
    return null;
  }
  if (!Array.isArray(notes) || notes.length === 0) {
    return null;
  }

  return (
    <div className="px-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Sources
      </p>
      <ul className="mt-2 space-y-1">
        {notes.map((note, index) => (
          <li
            key={`${note.field}-${index}`}
            className="text-[11px] leading-relaxed text-muted-foreground/80"
          >
            <span className="font-medium text-muted-foreground">{note.field}</span> —{" "}
            {note.source}
            {note.detail ? `: ${note.detail}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { ArrowLeft, Download, Flame, Leaf, Printer, Ruler, Star } from "lucide-react";
import { useTasks } from "@/lib/data/hooks";

import { DaysLeftPill } from "@/components/dashboard/DaysLeftPill";
import { InfoHint } from "@/components/dashboard/InfoHint";
import { Meter } from "@/components/dashboard/Meter";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { StatTile } from "@/components/dashboard/StatTile";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type CompliancePlan, dedash, parseBuildingSystems, parseCompliancePlan } from "@/lib/compliance/plan";
import {
  computeFundedPlan,
  computePeriods,
  computeRetrofit,
  DEFAULT_MEASURES,
  type FineResult,
  fmtTco2e,
  measureFullCosts,
  personalizedEngineMeasures,
  type RetrofitAssessment,
  type RetrofitMeasure,
} from "@/lib/engine";
import { buildComplianceCsv, downloadCsv, type LawExposureRow, slugForBuilding } from "@/lib/export-compliance";
import { capSeverity, compactUsd, formatShortDate } from "@/lib/format";
import { LAW_REGISTRY } from "@/lib/laws/lawRegistry";
import type { Building } from "@/lib/data/types";

import { BuildingDocuments, type OpenDoc } from "./building-documents";
import { BuildingSystems } from "./building-systems";
import { CompliancePlanPanel } from "./compliance-plan-panel";
import { FineTimeline } from "./fine-timeline";
import { RetrofitPlan } from "./retrofit-plan";

const TERMINAL_TASK_STATUSES = new Set(["done", "rejected"]);

// The optimizer's pick, fully funded, as a per-measure funding split across the
// building's fundable measures. Every applicable measure is fundable now (see
// engineMeasures below), so there is no visibility gate. This is both the
// planner's default and its reset target.
function optimizerFunding(
  building: Building,
  assessment: RetrofitAssessment | null,
  measures: RetrofitMeasure[],
): Record<string, number> {
  if (!assessment) {
    return {};
  }

  const picks = new Set(assessment.best.measureIds);
  const costs = measureFullCosts(building, measures);
  return Object.fromEntries(
    Object.entries(costs).map(([id, cost]) => [id, picks.has(id) ? cost : 0]),
  );
}

// The whole building compliance view: everything glanceable on one screen, with
// the wordy report and binder collapsed into Documents. Funding state lives here
// so the fine projection, the retrofit planner, and the CSV export read one set
// of numbers.
export function ComplianceDashboard({ building }: { building: Building }) {
  const tasks = useTasks();

  const periods = useMemo(() => computePeriods(building), [building]);
  const plan = useMemo(() => parseCompliancePlan(building.compliancePlanJson), [building]);
  const systems = useMemo(
    () => parseBuildingSystems(building.systemsJson) ?? plan?.personalization?.systems ?? null,
    [building, plan],
  );

  // The ROI sliders run on the building's personalized measures (categorized,
  // every applicable one fundable); the generic catalog is the no-plan fallback.
  const engineMeasures = useMemo(() => {
    const personalized = plan?.personalization?.measures ?? [];
    return personalized.length > 0 ? personalizedEngineMeasures(building, personalized) : DEFAULT_MEASURES;
  }, [building, plan]);

  const assessment = useMemo(() => computeRetrofit(building, engineMeasures), [building, engineMeasures]);

  const [funding, setFunding] = useState<Record<string, number>>(() =>
    optimizerFunding(building, assessment, engineMeasures),
  );
  const fundedPlan = useMemo(
    () => computeFundedPlan(building, funding, engineMeasures),
    [building, funding, engineMeasures],
  );
  const finesAvoidedUsd =
    fundedPlan && assessment ? Math.max(0, assessment.doNothing.horizonFinesUsd - fundedPlan.horizonFinesUsd) : null;

  const [openDoc, setOpenDoc] = useState<OpenDoc>(null);
  const [printRequested, setPrintRequested] = useState(false);

  // Printing needs the report mounted first; open it, then print once it renders.
  useEffect(() => {
    if (printRequested && openDoc === "report") {
      setPrintRequested(false);
      window.print();
    }
  }, [printRequested, openDoc]);

  const printReport = () => {
    if (openDoc === "report") {
      window.print();
      return;
    }
    setOpenDoc("report");
    setPrintRequested(true);
  };

  const buildingTasks = tasks.filter((task) => task.buildingId === building.id);
  const now = Date.now();

  const lawRows: LawExposureRow[] = LAW_REGISTRY.filter((law) => law.law_id !== "art321").map((law) => {
    const task = buildingTasks.find((candidate) => candidate.lawId === law.law_id);
    const overdue = task ? task.slaBreached || task.deadline.toDate().getTime() < now : false;
    return {
      short: law.short_name,
      name: law.display_name,
      status: task?.status ?? "missing",
      exposureUsd: task?.fineEstimateUsd,
      overdue,
    };
  });

  const activeTasks = buildingTasks.filter((task) => !TERMINAL_TASK_STATUSES.has(task.status));
  const nextDeadline =
    activeTasks.length > 0 ? new Date(Math.min(...activeTasks.map((task) => task.deadline.toDate().getTime()))) : null;

  const exportCsv = () => {
    const csv = buildComplianceCsv(building, fundedPlan, lawRows);
    downloadCsv(`fineprint-${slugForBuilding(building)}.csv`, csv);
  };

  const fineMessage =
    plan?.fineData?.message && plan.fineData.message.length > 0 ? dedash(plan.fineData.message) : null;

  return (
    <div className="@container/main flex flex-col gap-6">
      <div className="flex flex-col gap-6 print-hide">
        <BuildingHeader building={building} onExportCsv={exportCsv} onPrint={printReport} />

        <StatTiles periods={periods} nextDeadline={nextDeadline} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <FineProjectionCard results={fundedPlan?.results ?? null} message={fineMessage} />
          <CompliancePlanPanel plan={plan} fallbackRows={lawRows} />
        </div>

        <BuildingSystems systems={systems} />

        <RetrofitPlan
          personalizedMeasures={plan?.personalization?.measures ?? []}
          fundedPlan={fundedPlan}
          finesAvoidedUsd={finesAvoidedUsd}
          funding={funding}
          onFundingChange={setFunding}
          onResetOptimizer={
            assessment ? () => setFunding(optimizerFunding(building, assessment, engineMeasures)) : undefined
          }
        />
      </div>

      <BuildingDocuments
        building={building}
        assessment={assessment}
        openDoc={openDoc}
        onOpenChange={setOpenDoc}
        onPrintReport={printReport}
      />
    </div>
  );
}

function BuildingHeader({
  building,
  onExportCsv,
  onPrint,
}: {
  building: Building;
  onExportCsv: () => void;
  onPrint: () => void;
}) {
  const uses: Array<{ group: string; sqft: number }> = building.usesJson ? JSON.parse(building.usesJson) : [];

  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/dashboard/buildings"
        className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Buildings
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold tracking-tight">{building.address}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Ll97Badge building={building} />
            {building.annualEmissionsTco2E !== undefined ? (
              <Badge variant="outline">
                <Leaf className="mr-1 size-3" />
                {fmtTco2e(building.annualEmissionsTco2E)}/yr
              </Badge>
            ) : null}
            {building.energyStarScore !== undefined ? (
              <Badge variant="outline">
                <Star className="mr-1 size-3" />
                Energy Star {building.energyStarScore}
              </Badge>
            ) : null}
            {building.bbl ? <span className="font-mono text-xs text-muted-foreground">BBL {building.bbl}</span> : null}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Ruler className="size-3.5" />
              {building.sqft.toLocaleString()} sqft
            </span>
            {uses.map((use) => (
              <Badge key={use.group} variant="outline" className="text-xs">
                {use.group} / {use.sqft.toLocaleString()} sqft
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onExportCsv}>
            <Download className="mr-1 size-3.5" /> Export CSV
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onPrint}>
            <Printer className="mr-1 size-3.5" /> Print
          </Button>
        </div>
      </div>
    </div>
  );
}

function Ll97Badge({ building }: { building: Building }): ReactNode {
  if (building.ll97Covered === true) {
    return building.isAffordable ? (
      <StatusPill tone="warning" icon={<Flame className="size-3" />}>
        Article 321
      </StatusPill>
    ) : (
      <StatusPill tone="destructive" icon={<Flame className="size-3" />}>
        LL97 Covered
      </StatusPill>
    );
  }
  if (building.ll97Covered === false) {
    return (
      <Badge variant="secondary">
        <Flame className="mr-1 size-3" /> LL97 Exempt
      </Badge>
    );
  }
  return (
    <StatusPill tone="muted" icon={<Flame className="size-3" />}>
      LL97 Unknown
    </StatusPill>
  );
}

// A building fractionally over its cap rounds to 0%, but it is still over - show
// that in destructive, never as green headroom.
function capHeadroomLabel(overFraction: number | null): ReactNode {
  if (overFraction === null) {
    return undefined;
  }

  const overPercent = Math.round(overFraction * 100);
  if (overFraction > 0 && overPercent === 0) {
    return <span className="text-destructive">under 1% over cap</span>;
  }
  if (overPercent > 0) {
    return <span className="text-destructive">{overPercent}% over cap</span>;
  }
  return <span className="text-success">{Math.abs(overPercent)}% headroom</span>;
}

function StatTiles({ periods, nextDeadline }: { periods: FineResult[] | null; nextDeadline: Date | null }) {
  const fine0 = periods ? periods[0].annualFineUsd : null;
  const fine1 = periods ? periods[1].annualFineUsd : null;
  const actual = periods ? periods[0].actualEmissionsTco2e : null;
  const limit = periods ? periods[0].emissionsLimitTco2e : null;
  const overFraction = actual !== null && limit !== null && limit > 0 ? actual / limit - 1 : null;
  const cliffRatio = fine0 !== null && fine0 > 0 && fine1 !== null ? (fine1 / fine0).toFixed(1) : null;

  return (
    <div className="grid grid-cols-1 gap-3 @sm/main:grid-cols-2 @3xl/main:grid-cols-4">
      <StatTile
        label="Annual fine now"
        value={fine0 === null ? "-" : compactUsd(fine0)}
        tone={fine0 === null ? "default" : fine0 > 0 ? "destructive" : "success"}
        sub="2024-2029 per year"
      />
      <StatTile
        label="2030 annual fine"
        value={fine1 === null ? "-" : compactUsd(fine1)}
        tone={fine1 === null ? "default" : fine1 > 0 ? "destructive" : "success"}
        sub={cliffRatio && Number(cliffRatio) > 1 ? `${cliffRatio}x current` : "2030-2034 per year"}
      />
      <StatTile
        label="Emissions vs cap"
        value={
          actual !== null && limit !== null
            ? `${Math.round(actual).toLocaleString()} / ${Math.round(limit).toLocaleString()} t`
            : "-"
        }
        meter={
          actual !== null && limit !== null ? (
            <Meter
              fraction={limit > 0 ? Math.min(actual / limit, 1) : 0}
              tone={capSeverity(actual, limit)}
              ariaLabel="Emissions against cap"
            />
          ) : undefined
        }
        sub={capHeadroomLabel(overFraction)}
      />
      <StatTile
        label="Next deadline"
        value={nextDeadline ? formatShortDate(nextDeadline) : "-"}
        sub={nextDeadline ? <DaysLeftPill date={nextDeadline} /> : undefined}
      />
    </div>
  );
}

function FineProjectionCard({ results, message }: { results: FineResult[] | null; message: string | null }) {
  return (
    <SectionCard
      title="Fine projection"
      titleAside={message ? <InfoHint text={message} label="Why these figures" /> : undefined}
      sub={results ? "At current funding - adjust in the retrofit plan below." : undefined}
    >
      {results ? (
        <FineTimeline periods={results} />
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No energy benchmarking on file yet. The LL97 projection unlocks once this building is benchmarked.
        </p>
      )}
    </SectionCard>
  );
}

"use client";

import Link from "next/link";
import { useTable } from "spacetimedb/react";
import { tables } from "@/module_bindings/index";
import {
  computePeriods,
  computeRetrofit,
  fmtUsd,
  fmtTco2e,
  type RetrofitAssessment,
} from "@/lib/engine";
import { FineTimeline } from "./fine-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Task, Submission } from "@/module_bindings/types";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "secondary",
  claimed: "outline",
  in_review: "outline",
  approved: "default",
  rejected: "destructive",
  done: "default",
};

interface Props {
  buildingId: bigint;
}

export function BuildingClient({ buildingId }: Props) {
  const [buildings] = useTable(tables.building);
  const [tasks] = useTable(tables.task);
  const [submissions] = useTable(tables.submission);

  const building = buildings.find(b => b.id === buildingId);
  if (!building) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
        Building not found.{" "}
        <Link href="/dashboard/portfolio" className="ml-1 underline">
          Back to portfolio
        </Link>
      </div>
    );
  }

  const periods = computePeriods(building);
  const buildingTasks = [...tasks]
    .filter(t => t.buildingId === buildingId)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

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
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Back link */}
      <div>
        <Link
          href="/dashboard/portfolio"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Portfolio
        </Link>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">{building.address}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {building.bbl && <span className="mr-3">BBL {building.bbl}</span>}
                {building.sqft.toLocaleString()} sqft
                {uses.length > 0 && (
                  <span className="ml-3">
                    {uses
                      .map(u => `${u.group}: ${u.sqft.toLocaleString()} sqft`)
                      .join(" · ")}
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={building.ll97Covered ? "destructive" : "secondary"}>
                {ll97Status}
              </Badge>
              {building.annualEmissionsTco2E !== undefined && (
                <Badge variant="outline">
                  {fmtTco2e(building.annualEmissionsTco2E)}/yr
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Fine timeline */}
      {periods ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Fine projection</CardTitle>
            </CardHeader>
            <CardContent>
              <FineTimeline periods={periods} />
            </CardContent>
          </Card>

          <PlainEnglishCard periods={periods} address={building.address} />

          <RetrofitCard assessment={computeRetrofit(building)} />
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No energy data yet. Run the ingest pipeline to pull real LL84 data and unlock
            the fine projection.
          </CardContent>
        </Card>
      )}

      {/* Compliance tasks */}
      {buildingTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Compliance tasks</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {buildingTasks.map(task => {
                const latestSub = [...submissions]
                  .filter(s => s.taskId === task.id)
                  .sort((a, b) => (a.id > b.id ? -1 : 1))[0];

                return (
                  <details key={String(task.id)} className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-6 py-4 hover:bg-muted/50">
                      <Badge
                        variant={STATUS_VARIANT[task.status] ?? "secondary"}
                        className="shrink-0"
                      >
                        {task.status.replace("_", " ")}
                      </Badge>
                      <span className="flex-1 text-sm font-medium">{task.title}</span>
                      {task.fineEstimateUsd !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          {fmtUsd(task.fineEstimateUsd)}/yr
                        </span>
                      )}
                      {task.slaBreached && (
                        <Badge variant="destructive" className="text-xs">
                          SLA breached
                        </Badge>
                      )}
                    </summary>
                    {latestSub && (
                      <div className="px-6 pb-4">
                        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                          {latestSub.body}
                        </pre>
                      </div>
                    )}
                  </details>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PlainEnglishCard({
  periods,
  address,
}: {
  periods: ReturnType<typeof computePeriods> & {};
  address: string;
}) {
  if (!periods) return null;
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
              <span className="font-medium">
                {fmtTco2e(current.actualEmissionsTco2e)}
              </span>
              /year against a 2024–2029 cap of{" "}
              <span className="font-medium">{fmtTco2e(current.emissionsLimitTco2e)}</span>
              . The{" "}
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
                {cliffRatio && Number(cliffRatio) > 1.1
                  ? ` — a ${cliffRatio}× increase`
                  : ""}
                . By 2035 it reaches{" "}
                <span className="font-medium text-destructive">
                  {fmtUsd(p2035.annualFineUsd)}/year
                </span>
                .
              </p>
            )}
            <p>
              The fastest path to $0: close the{" "}
              <span className="font-medium">{fmtTco2e(current.overageTco2e)}</span> gap
              before 2030.
            </p>
          </>
        )}

        <div className="border-t pt-3 space-y-1">
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

// The optimizer's verdict. An honest empty state matters here: at some
// scales doing nothing beats every retrofit combo, and saying so builds
// more trust than inventing a pitch.
function RetrofitCard({ assessment }: { assessment: RetrofitAssessment | null }) {
  if (!assessment) return null;

  const best = assessment.best;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cheapest path to compliance</CardTitle>
        <p className="text-sm text-muted-foreground">
          {assessment.evaluatedSubsets} measure combinations evaluated against fines
          through 2039. Capex figures are typical-building assumptions, not quotes.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {best.measureIds.length === 0 ? (
          <p className="text-sm">
            No retrofit package beats paying the fines as modeled — projected fines
            through 2039 are {fmtUsd(assessment.doNothing.horizonFinesUsd)} and every
            measure combination costs more than it avoids. Get firm quotes before ruling
            investment out.
          </p>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-medium">{best.measureIds.join(", ")}</span>
            </p>
            <div className="grid grid-cols-1 gap-3 @sm/main:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Capex</p>
                <p className="text-lg font-semibold">{fmtUsd(best.capexUsd)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Projected emissions</p>
                <p className="text-lg font-semibold">
                  {fmtTco2e(best.projectedEmissionsTco2e)}/yr
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Fines avoided through 2039
                </p>
                <p className="text-lg font-semibold text-success">
                  {fmtUsd(assessment.finesAvoidedUsd)}
                </p>
              </div>
            </div>
          </>
        )}
        <p className="border-t pt-3 text-xs text-muted-foreground">
          {assessment.notes.join(" ")}
        </p>
      </CardContent>
    </Card>
  );
}

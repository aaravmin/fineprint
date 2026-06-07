"use client";

import Link from "next/link";

import { ArrowLeft, Banknote, Flame, Leaf, Ruler } from "lucide-react";
import { useTable } from "spacetimedb/react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computePeriods, computeRetrofit, fmtTco2e, fmtUsd, type RetrofitAssessment } from "@/lib/engine";
import { tables } from "@/module_bindings/index";

import { FineTimeline } from "./fine-timeline";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
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

  const building = buildings.find((b) => b.id === buildingId);
  if (!building) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        Building not found.
        <Link href="/dashboard/portfolio" className="inline-flex items-center gap-1 underline hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back to portfolio
        </Link>
      </div>
    );
  }

  const periods = computePeriods(building);
  const buildingTasks = [...tasks].filter((t) => t.buildingId === buildingId).sort((a, b) => (a.id < b.id ? -1 : 1));

  const uses: Array<{ group: string; sqft: number }> = building.usesJson ? JSON.parse(building.usesJson) : [];

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
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/portfolio">Portfolio</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{building.address}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
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
                  {uses.map((u) => (
                    <Badge key={u.group} variant="outline" className="text-xs">
                      {u.group} / {u.sqft.toLocaleString()} sqft
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
            No energy data yet. Run the ingest pipeline to pull real LL84 data and unlock the fine projection.
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
            <Accordion type="multiple" className="w-full">
              {buildingTasks.map((task) => {
                const latestSub = [...submissions]
                  .filter((s) => s.taskId === task.id)
                  .sort((a, b) => (a.id > b.id ? -1 : 1))[0];

                return (
                  <AccordionItem key={String(task.id)} value={String(task.id)} className="border-b last:border-b-0">
                    <AccordionTrigger className="px-6 py-4 hover:bg-muted/50 hover:no-underline [&>svg]:shrink-0">
                      <span className="flex flex-1 items-center gap-3 text-left">
                        <Badge variant={STATUS_VARIANT[task.status] ?? "secondary"} className="shrink-0">
                          {task.status.replace("_", " ")}
                        </Badge>
                        <span className="flex-1 text-sm font-medium">{task.title}</span>
                        {task.fineEstimateUsd !== undefined && (
                          <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                            {fmtUsd(task.fineEstimateUsd)}/yr
                          </span>
                        )}
                        {task.slaBreached && (
                          <Badge variant="destructive" className="text-xs">
                            SLA breached
                          </Badge>
                        )}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-4">
                      {latestSub ? (
                        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                          {latestSub.body}
                        </pre>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No submission yet — an agent will draft this filing.
                        </p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PlainEnglishCard({ periods, address }: { periods: ReturnType<typeof computePeriods> & {}; address: string }) {
  if (!periods) return null;
  const current = periods[0];
  const p2030 = periods[1];
  const p2035 = periods[2];
  const isArticle321 = current.pathway === "article321";
  const cliffRatio = current.annualFineUsd > 0 ? (p2030.annualFineUsd / current.annualFineUsd).toFixed(1) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plain English</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed">
        {isArticle321 ? (
          <p>
            <span className="font-medium">{address}</span> qualifies for the LL97 Article 321 affordable housing
            pathway. It must implement the prescribed energy conservation measures (Admin Code 28-321.2.2) or meet its
            2030 target of <span className="font-medium text-success">{fmtTco2e(current.emissionsLimitTco2e)}</span>{" "}
            early. Non-compliance draws flat $10,000 penalties — not modeled here.
          </p>
        ) : current.compliant ? (
          <p>
            <span className="font-medium">{address}</span> is compliant across all three LL97 periods. Its emissions of{" "}
            <span className="font-medium">{fmtTco2e(current.actualEmissionsTco2e)}</span> stay below the 2024–2029 cap
            of <span className="font-medium text-success">{fmtTco2e(current.emissionsLimitTco2e)}</span>.
          </p>
        ) : (
          <>
            <p>
              <span className="font-medium">{address}</span> emits{" "}
              <span className="font-medium">{fmtTco2e(current.actualEmissionsTco2e)}</span>
              /year against a 2024–2029 cap of{" "}
              <span className="font-medium">{fmtTco2e(current.emissionsLimitTco2e)}</span>. The{" "}
              <span className="font-medium text-destructive">{fmtTco2e(current.overageTco2e)} overage</span> costs{" "}
              <span className="font-medium text-destructive">{fmtUsd(current.annualFineUsd)}/year</span> at $268/tCO₂e.¹
            </p>
            {p2030.annualFineUsd > 0 && (
              <p>
                In 2030, the cap tightens. With the same emissions, the fine jumps to{" "}
                <span className="font-medium text-destructive">{fmtUsd(p2030.annualFineUsd)}/year</span>
                {cliffRatio && Number(cliffRatio) > 1.1 ? ` — a ${cliffRatio}× increase` : ""}. By 2035 it reaches{" "}
                <span className="font-medium text-destructive">{fmtUsd(p2035.annualFineUsd)}/year</span>.
              </p>
            )}
            <p>
              The fastest path to $0: close the <span className="font-medium">{fmtTco2e(current.overageTco2e)}</span>{" "}
              gap before 2030.
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
          {assessment.evaluatedSubsets} measure combinations evaluated against fines through 2039. Capex figures are
          typical-building assumptions, not quotes.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {best.measureIds.length === 0 ? (
          <p className="text-sm">
            No retrofit package beats paying the fines as modeled — projected fines through 2039 are{" "}
            {fmtUsd(assessment.doNothing.horizonFinesUsd)} and every measure combination costs more than it avoids. Get
            firm quotes before ruling investment out.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {best.measureIds.map((id) => (
                <Badge key={id} variant="secondary">
                  {id}
                </Badge>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 @sm/main:grid-cols-3">
              <RetrofitStat icon={<Banknote className="size-4" />} label="Capex" value={fmtUsd(best.capexUsd)} />
              <RetrofitStat
                icon={<Leaf className="size-4" />}
                label="Projected emissions"
                value={`${fmtTco2e(best.projectedEmissionsTco2e)}/yr`}
              />
              <RetrofitStat
                icon={<Banknote className="size-4" />}
                label="Fines avoided through 2039"
                value={fmtUsd(assessment.finesAvoidedUsd)}
                valueClassName="text-success"
              />
            </div>
          </>
        )}
        <p className="border-t pt-3 text-xs text-muted-foreground">{assessment.notes.join(" ")}</p>
      </CardContent>
    </Card>
  );
}

function RetrofitStat({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border bg-background px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${valueClassName ?? ""}`}>{value}</p>
    </div>
  );
}

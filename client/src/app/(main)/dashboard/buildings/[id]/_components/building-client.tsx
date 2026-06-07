"use client";

import Link from "next/link";

import { ArrowLeft, BookOpenCheck, Flame, Leaf, Ruler } from "lucide-react";
import { useTable } from "spacetimedb/react";

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
import { computePeriods, fmtTco2e, fmtUsd } from "@/lib/engine";
import { tables } from "@/module_bindings/index";

import { ComplianceSection } from "./compliance-section";
import { FineTimeline } from "./fine-timeline";
import { InvestmentPlanner } from "./investment-planner";

interface Props {
  buildingId: bigint;
}

export function BuildingClient({ buildingId }: Props) {
  const [buildings] = useTable(tables.building);

  const building = buildings.find(b => b.id === buildingId);
  if (!building) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        Building not found.
        <Link
          href="/dashboard/portfolio"
          className="inline-flex items-center gap-1 underline hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to portfolio
        </Link>
      </div>
    );
  }

  const periods = computePeriods(building);

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
                {building.bbl && (
                  <span className="font-mono text-xs">BBL {building.bbl}</span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Ruler className="size-3.5" />
                  {building.sqft.toLocaleString()} sqft
                </span>
              </div>
              {uses.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {uses.map(u => (
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

          <InvestmentPlanner building={building} />
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No energy data yet. Run the ingest pipeline to pull real LL84 data and unlock
            the fine projection.
          </CardContent>
        </Card>
      )}

      {/* Whole-building compliance plan, computed at intake by the data layer */}
      <CompliancePlanCard planJson={building.compliancePlanJson} />

      {/* Every law in one aligned ledger: status, fine, draft, and sign-off */}
      <ComplianceSection buildingId={buildingId} />

      <ProvenanceFootnotes provenanceJson={building.provenanceJson} />
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
              <p
                key={credit}
                className="flex items-start gap-2 text-xs text-foreground/80"
              >
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

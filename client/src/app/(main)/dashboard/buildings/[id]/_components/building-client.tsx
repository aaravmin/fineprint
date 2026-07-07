"use client";

import Link from "next/link";

import { ArrowLeft, Flame, Leaf } from "lucide-react";

import { ComplianceBinder } from "@/components/compliance/ComplianceBinder";
import { ComplianceReport } from "@/components/dashboard/ComplianceReport";
import { tables } from "@/lib/db";
import { useTable, useTableLoaded } from "@/lib/db/react";
import type { Building } from "@/lib/db/types";
import { computePeriods, computeRetrofit, type FineResult, fmtTco2e, fmtUsd } from "@/lib/engine";

import { ComplianceSection } from "./compliance-section";
import { FineTimeline } from "./fine-timeline";
import { InvestmentPlanner } from "./investment-planner";

interface Props {
  buildingId: number;
}

interface BuildingUse {
  group: string;
  sqft: number;
}

export function BuildingClient({ buildingId }: Props) {
  const [buildings] = useTable(tables.building);
  const buildingsLoaded = useTableLoaded(tables.building);

  const building = buildings.find((b) => b.id === buildingId);
  if (!building && !buildingsLoaded) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">Loading building...</div>
    );
  }
  if (!building) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        Building not found.
        <Link href="/dashboard/buildings" className="inline-flex items-center gap-1 underline hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back to buildings
        </Link>
      </div>
    );
  }

  const periods = computePeriods(building);
  const assessment = computeRetrofit(building);
  const uses = parseBuildingUses(building.usesJson);

  return (
    <div className="@container/main mx-auto flex w-full max-w-5xl flex-col gap-10">
      <BuildingHeader building={building} uses={uses} />

      <VerdictBand periods={periods} />

      <ComplianceSection buildingId={buildingId} planJson={building.compliancePlanJson} />

      <InvestmentPlanner building={building} />

      <ComplianceBinder building={building} />

      <ComplianceReport building={building} assessment={assessment} />

      <ProvenanceFootnotes />
    </div>
  );
}

function parseBuildingUses(raw: string | undefined): BuildingUse[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((use): use is BuildingUse => typeof use?.group === "string" && typeof use?.sqft === "number");
  } catch {
    return [];
  }
}

function BuildingHeader({ building, uses }: { building: Building; uses: BuildingUse[] }) {
  const ll97Status =
    building.ll97Covered === true
      ? building.isAffordable
        ? "Article 321"
        : "LL97 Covered"
      : building.ll97Covered === false
        ? "LL97 Exempt"
        : "LL97 status unknown";

  const metadata = [
    building.bbl ? `BBL ${building.bbl}` : null,
    `${building.sqft.toLocaleString()} sqft`,
    uses[0]?.group ?? null,
  ].filter(Boolean) as string[];

  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6">
      <Link
        href="/dashboard/buildings"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Buildings
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{building.address}</h1>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{metadata.join("  ·  ")}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${building.ll97Covered ? "bg-destructive-subtle text-destructive" : "bg-secondary text-muted-foreground"}`}
          >
            <Flame className="size-3" />
            {ll97Status}
          </span>
          {building.annualEmissionsTco2e !== undefined && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
              <Leaf className="size-3" />
              {fmtTco2e(building.annualEmissionsTco2e)}/yr
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function VerdictBand({ periods }: { periods: FineResult[] | null }) {
  if (!periods) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
        No energy data yet. Run the ingest pipeline to pull real LL84 data and unlock the fine projection.
      </div>
    );
  }

  const [current, p2030, p2035] = periods;
  const compliant = periods.every((period) => period.compliant);
  const headline = compliant ? current : p2030;
  const headlineLabel = compliant ? "Fine today" : "At the 2030 cliff";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid gap-8 p-6 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:items-stretch md:gap-10 md:p-8">
        <div className="flex flex-col justify-between gap-8">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{headlineLabel}</p>
            <p
              className={`font-heading mt-2 text-[clamp(2.5rem,7vw,4rem)] font-bold leading-none tabular-nums ${headline.annualFineUsd > 0 ? "text-destructive" : "text-success"}`}
            >
              {headline.annualFineUsd > 0 ? fmtUsd(headline.annualFineUsd) : "$0"}
              {headline.annualFineUsd > 0 && (
                <span className="ml-1 text-xl font-semibold text-muted-foreground">/yr</span>
              )}
            </p>
          </div>

          <dl className="flex gap-6 text-sm">
            <PeriodStat label="2024–2029" value={current.annualFineUsd} />
            <PeriodStat label="2030–2034" value={p2030.annualFineUsd} emphasize />
            <PeriodStat label="2035–2039" value={p2035.annualFineUsd} />
          </dl>
        </div>

        <div className="min-w-0">
          <FineTimeline periods={periods} />
        </div>
      </div>
    </section>
  );
}

function PeriodStat({ label, value, emphasize }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={`mt-0.5 text-sm font-semibold tabular-nums ${value > 0 ? (emphasize ? "text-destructive" : "text-foreground") : "text-success"}`}
      >
        {value > 0 ? fmtUsd(value) : "$0"}
      </dd>
    </div>
  );
}

function ProvenanceFootnotes() {
  return (
    <footer className="border-t border-border pt-5 text-[11px] leading-relaxed text-muted-foreground/70">
      Data sourced from NYC LL84 benchmarking submissions and LL97 emission limits (1 RCNY §103-14). Not legal advice.
      Official compliance requires a registered design professional.{" "}
      <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
        Privacy policy
      </Link>
      .
    </footer>
  );
}

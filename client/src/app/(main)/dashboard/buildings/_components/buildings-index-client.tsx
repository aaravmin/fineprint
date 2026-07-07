"use client";

import Link from "next/link";

import { ArrowUpRight, Plus } from "lucide-react";

import { tables } from "@/lib/db";
import { useTable } from "@/lib/db/react";
import type { Building, Task } from "@/lib/db/types";
import { computePeriods, fmtUsd } from "@/lib/engine";

interface BuildingView {
  building: Building;
  overCap: boolean;
  today: number | null;
  cliff: number | null;
  y2035: number | null;
  openTasks: number;
  reviewTasks: number;
}

function periodFine(building: Building, index: number): number | null {
  return computePeriods(building)?.[index]?.annualFineUsd ?? null;
}

function toView(building: Building, tasks: readonly Task[]): BuildingView {
  const buildingTasks = tasks.filter((task) => task.buildingId === building.id);
  const cliff = periodFine(building, 1);
  return {
    building,
    overCap: (cliff ?? 0) > 0,
    today: periodFine(building, 0),
    cliff,
    y2035: periodFine(building, 2),
    openTasks: buildingTasks.filter((task) => task.status === "open").length,
    reviewTasks: buildingTasks.filter((task) => task.status === "in_review").length,
  };
}

export function BuildingsIndexClient() {
  const [buildings] = useTable(tables.building);
  const [tasks] = useTable(tables.task);

  const views = buildings.map((building) => toView(building, tasks)).sort((a, b) => (b.cliff ?? 0) - (a.cliff ?? 0));

  return (
    <div className="@container/main flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Buildings</h1>

        <Link
          href="/dashboard/portfolio"
          className="fp-press inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-foreground/25"
        >
          <Plus className="size-4" /> Add a building
        </Link>
      </header>

      {views.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border py-24 text-center">
          <p className="font-heading text-lg font-semibold">No buildings yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add a NYC address to pull the city&apos;s records and see its LL97 fine, the 2030 cliff, and every covered
            obligation.
          </p>
          <Link
            href="/dashboard/portfolio"
            className="fp-press mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Add your first building
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
          {views.map((view) => (
            <BuildingCard key={String(view.building.id)} view={view} />
          ))}
        </div>
      )}
    </div>
  );
}

function BuildingCard({ view }: { view: BuildingView }) {
  const { building, overCap, today, cliff, y2035, openTasks, reviewTasks } = view;

  return (
    <Link
      href={`/dashboard/buildings/${building.id}`}
      data-over={overCap}
      className="group flex h-full flex-col rounded-2xl border border-t-2 border-border bg-card p-5 hover:border-foreground/20 data-[over=true]:border-t-destructive/60"
    >
      <h2 className="font-heading truncate text-base font-semibold leading-tight tracking-tight">{building.address}</h2>

      <div className="mt-6 flex items-end justify-between gap-4">
        <p className={`font-heading text-3xl font-bold tabular-nums ${overCap ? "text-destructive" : "text-success"}`}>
          {cliff === null ? "—" : cliff > 0 ? `${fmtUsd(cliff)}/yr` : "$0"}
        </p>
        <Sparkline today={today} cliff={cliff} y2035={y2035} overCap={overCap} />
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-3">
          {reviewTasks > 0 && (
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-600">
              <span className="size-1.5 rounded-full bg-amber-500" />
              {reviewTasks} to review
            </span>
          )}
          <span>{openTasks > 0 ? `${openTasks} open` : "no open tasks"}</span>
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground/50 group-hover:text-foreground" />
      </div>
    </Link>
  );
}

// Three period bars (2024-29 / 2030 / 2035), each scaled to this building's own
// peak so the shape of the cliff reads at a glance. A compliant building shows
// a flat green baseline instead of a spike.
function Sparkline({
  today,
  cliff,
  y2035,
  overCap,
}: {
  today: number | null;
  cliff: number | null;
  y2035: number | null;
  overCap: boolean;
}) {
  const values = [today ?? 0, cliff ?? 0, y2035 ?? 0];
  const peak = Math.max(...values, 1);
  const labels = ["'24", "'30", "'35"];

  return (
    <div className="flex items-end gap-1" aria-hidden="true">
      {values.map((value, index) => {
        const heightPercent = overCap ? Math.max((value / peak) * 100, value > 0 ? 12 : 6) : 20;
        return (
          <div key={labels[index]} className="flex flex-col items-center gap-1">
            <div className="flex h-9 w-4 items-end">
              <div
                className={`w-full rounded-sm ${overCap ? "bg-destructive/80" : "bg-success/70"}`}
                style={{ height: `${heightPercent}%` }}
              />
            </div>
            <span className="font-mono text-[9px] text-muted-foreground/60">{labels[index]}</span>
          </div>
        );
      })}
    </div>
  );
}

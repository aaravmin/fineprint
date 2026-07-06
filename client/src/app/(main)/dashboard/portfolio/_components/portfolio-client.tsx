"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";

import {
  Activity,
  BadgeCheck,
  Building2,
  Calendar,
  CircleDollarSign,
  Clock,
  FileText,
  Leaf,
  ListTodo,
  Skull,
  TrendingUp,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useBuildings, useEvents, useTasks, useWorkers } from "@/lib/data/hooks";

import { AddBuildingDialog } from "@/components/dashboard/AddBuildingDialog";
import { DaysLeftPill } from "@/components/dashboard/DaysLeftPill";
import { ActionLink, SectionCard } from "@/components/dashboard/SectionCard";
import { StatTile } from "@/components/dashboard/StatTile";
import { StatusDot } from "@/components/dashboard/StatusPill";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRequestBuilding } from "@/hooks/use-request-building";
import { computePeriods } from "@/lib/engine";
import { compactNumber, compactUsd, formatShortDate, relativeTimeAgo, shortAddress } from "@/lib/format";
import { lawShortName } from "@/lib/laws/lawRegistry";
import type { Building, Event, Task, Worker } from "@/lib/data/types";

function greetingWord(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

const TERMINAL_TASK_STATUSES = new Set(["done", "rejected"]);

export function PortfolioClient({ firstName }: { firstName?: string | null }) {
  const buildings = useBuildings();
  const tasks = useTasks();
  const workers = useWorkers();
  const events = useEvents();

  const { submit } = useRequestBuilding();
  const requestedQueryAddress = useRef<string | null>(null);

  // The homepage CTA deep-links here with ?address=; submit that intake once on
  // arrival, the same optimistic path the dialog uses, minus any inline UI.
  useEffect(() => {
    const queryAddress = new URLSearchParams(window.location.search).get("address")?.trim();
    if (!queryAddress || requestedQueryAddress.current === queryAddress) {
      return;
    }

    requestedQueryAddress.current = queryAddress;
    submit(queryAddress);
  }, [submit]);

  // Time-of-day greeting and the date chips depend on the wall clock, which the
  // server can't know without risking a hydration mismatch; resolve after mount.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);

  const fines = useMemo(
    () =>
      buildings.map((building) => {
        const periods = computePeriods(building);
        return {
          building,
          fine0: periods?.[0]?.annualFineUsd ?? 0,
          fine1: periods?.[1]?.annualFineUsd ?? 0,
          fine2: periods?.[2]?.annualFineUsd ?? 0,
          actual: periods?.[0]?.actualEmissionsTco2e ?? 0,
          limit: periods?.[0]?.emissionsLimitTco2e ?? 0,
          hasData: periods !== null,
        };
      }),
    [buildings],
  );

  const nowMs = Date.now();
  const openTasks = tasks.filter((task) => task.status === "open");
  const overdueOpen = openTasks.filter((task) => task.slaBreached || task.deadline.toDate().getTime() < nowMs);

  const totalFine0 = fines.reduce((sum, row) => sum + row.fine0, 0);
  const totalFine1 = fines.reduce((sum, row) => sum + row.fine1, 0);
  const totalEmissions = buildings.reduce((sum, building) => sum + (building.annualEmissionsTco2E ?? 0), 0);
  const totalSqft = buildings.reduce((sum, building) => sum + building.sqft, 0);
  const missingDataCount = fines.filter((row) => !row.hasData).length;

  const sumActual = fines.reduce((sum, row) => sum + row.actual, 0);
  const sumLimit = fines.reduce((sum, row) => sum + row.limit, 0);
  const percentOverCaps = sumLimit > 0 && sumActual > sumLimit ? Math.round((sumActual / sumLimit - 1) * 100) : 0;

  const cliffRatio = totalFine0 > 0 ? (totalFine1 / totalFine0).toFixed(1) : null;

  const nextDeadline =
    openTasks.length > 0 ? new Date(Math.min(...openTasks.map((task) => task.deadline.toDate().getTime()))) : null;

  return (
    <div className="@container/main flex flex-col gap-6">
      <div className="flex flex-col gap-4 @2xl/main:flex-row @2xl/main:items-start @2xl/main:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            {firstName ? (now ? `${greetingWord(now)}, ${firstName}` : `Welcome, ${firstName}`) : "Overview"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{"Here's where your portfolio stands."}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {now ? (
            <Chip>
              <Calendar className="size-3.5" />
              {formatShortDate(now)}
            </Chip>
          ) : null}
          {nextDeadline ? (
            <Chip>
              <Clock className="size-3.5" />
              Next deadline {formatShortDate(nextDeadline)}
              <DaysLeftPill date={nextDeadline} now={now ?? undefined} />
            </Chip>
          ) : null}
          <AddBuildingDialog />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 @sm/main:grid-cols-2 @5xl/main:grid-cols-5">
        <StatTile
          icon={<Building2 />}
          label="Buildings"
          value={buildings.length.toString()}
          sub={
            missingDataCount > 0 ? (
              <span className="text-warning">{missingDataCount} missing energy data</span>
            ) : (
              `${compactNumber(totalSqft)} sqft`
            )
          }
        />
        <StatTile
          icon={<Leaf />}
          label="Portfolio emissions"
          value={`${compactNumber(totalEmissions)} t`}
          tooltip="Sum of benchmarked annual emissions (tCO2e per year) across your portfolio."
          sub={
            percentOverCaps > 0 ? (
              <span className="text-warning">{percentOverCaps}% over 2024 caps</span>
            ) : (
              "CO2e per year"
            )
          }
        />
        <StatTile
          icon={<CircleDollarSign />}
          label="Annual fine exposure"
          value={compactUsd(totalFine0)}
          tone={totalFine0 > 0 ? "destructive" : "default"}
          sub="2024-2029 per year"
        />
        <StatTile
          icon={<TrendingUp />}
          label="2030 fine exposure"
          value={compactUsd(totalFine1)}
          tone={totalFine1 > 0 ? "destructive" : "default"}
          tooltip="The 2030-2034 LL97 cap tightens sharply. This is your annual exposure once it does."
          sub={cliffRatio && Number(cliffRatio) > 1 ? `${cliffRatio}x current` : "the 2030 cliff"}
        />
        <StatTile
          icon={<ListTodo />}
          label="Open tasks"
          value={openTasks.length.toString()}
          sub={
            overdueOpen.length > 0 ? (
              <span className="text-destructive">{overdueOpen.length} overdue</span>
            ) : openTasks.length > 0 ? (
              "all on track"
            ) : (
              "none open"
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        <ExposureByBuilding fines={fines} />
        <DeadlinesPanel tasks={tasks} buildings={buildings} now={now} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <NeedsAttentionPanel fines={fines} overdueTasks={overdueOpen} buildings={buildings} />
        <RecentActivityPanel events={events} />
        <AgentsPanel workers={workers} tasks={tasks} now={now} />
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

type FineRow = {
  building: Building;
  fine0: number;
  fine1: number;
  fine2: number;
  hasData: boolean;
};

function ExposureByBuilding({ fines }: { fines: FineRow[] }) {
  const exposed = fines.filter((row) => row.fine1 > 0).sort((a, b) => b.fine1 - a.fine1);
  const quietCount = fines.length - exposed.length;
  const maxFine = Math.max(...exposed.map((row) => row.fine1), 1);

  return (
    <SectionCard title="Exposure by building" sub="Annual LL97 fine once the 2030 cap takes effect">
      {exposed.length === 0 ? (
        <p className="py-6 text-center text-sm text-success">
          Every building is compliant or awaiting data. No modeled 2030 exposure.
        </p>
      ) : (
        <TooltipProvider delayDuration={150}>
          <ul className="space-y-3.5">
            {exposed.map((row) => (
              <li key={String(row.building.id)}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href={`/dashboard/buildings/${row.building.id}`} className="group block">
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-foreground group-hover:underline">
                          {shortAddress(row.building.address)}
                        </span>
                        <span className="shrink-0 tabular-nums text-foreground">{compactUsd(row.fine1)}</span>
                      </div>
                      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-chart-1/10">
                        <div
                          className="h-full rounded-full bg-chart-1"
                          style={{ width: `${Math.max((row.fine1 / maxFine) * 100, 2)}%` }}
                        />
                      </div>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="tabular-nums">
                    <p className="mb-1 font-medium">{shortAddress(row.building.address)}</p>
                    <p>2024-2029: {compactUsd(row.fine0)} per year</p>
                    <p>2030-2034: {compactUsd(row.fine1)} per year</p>
                    <p>2035-2039: {compactUsd(row.fine2)} per year</p>
                  </TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        </TooltipProvider>
      )}

      {quietCount > 0 ? (
        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          {quietCount} {quietCount === 1 ? "building" : "buildings"} compliant or missing data
        </p>
      ) : null}
    </SectionCard>
  );
}

function DeadlinesPanel({
  tasks,
  buildings,
  now,
}: {
  tasks: readonly Task[];
  buildings: readonly Building[];
  now: Date | null;
}) {
  const upcoming = tasks
    .filter((task) => !TERMINAL_TASK_STATUSES.has(task.status))
    .sort((a, b) => a.deadline.toDate().getTime() - b.deadline.toDate().getTime())
    .slice(0, 8);

  return (
    <SectionCard
      title="Deadlines"
      action={upcoming.length > 0 ? <ActionLink href="/dashboard/tasks">View all tasks</ActionLink> : undefined}
    >
      {upcoming.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No deadlines on file - add a building.</p>
      ) : (
        <ul className="divide-y">
          {upcoming.map((task) => {
            const building = buildings.find((candidate) => candidate.id === task.buildingId);
            const deadline = task.deadline.toDate();

            return (
              <li key={String(task.id)}>
                <Link
                  href={building ? `/dashboard/buildings/${building.id}` : "/dashboard/tasks"}
                  className="flex items-center justify-between gap-2 py-2.5 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {lawShortName(task.lawId)}
                      </span>
                      <span className="truncate text-xs font-medium">
                        {building ? shortAddress(building.address) : task.title}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">due {formatShortDate(deadline)}</p>
                  </div>
                  <DaysLeftPill date={deadline} now={now ?? undefined} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function NeedsAttentionPanel({
  fines,
  overdueTasks,
  buildings,
}: {
  fines: FineRow[];
  overdueTasks: readonly Task[];
  buildings: readonly Building[];
}) {
  const items: { key: string; tone: "destructive" | "warning"; label: string; href: string }[] = [];

  for (const task of overdueTasks) {
    const building = buildings.find((candidate) => candidate.id === task.buildingId);
    items.push({
      key: `task-${task.id}`,
      tone: "destructive",
      label: `${task.title} overdue`,
      href: building ? `/dashboard/buildings/${building.id}` : "/dashboard/tasks",
    });
  }

  for (const row of fines) {
    if (!row.hasData) {
      items.push({
        key: `missing-${row.building.id}`,
        tone: "warning",
        label: `${shortAddress(row.building.address)} - no energy data`,
        href: `/dashboard/buildings/${row.building.id}`,
      });
    }
  }

  const shown = items.slice(0, 6);

  return (
    <SectionCard title="Needs attention">
      {shown.length === 0 ? (
        <p className="py-4 text-sm text-success">All clear.</p>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((item) => (
            <li key={item.key}>
              <Link href={item.href} className="flex items-center gap-2 text-xs hover:text-foreground">
                <StatusDot tone={item.tone} label={item.tone === "destructive" ? "Overdue" : "Warning"} />
                <span className="truncate text-muted-foreground">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items.length > shown.length ? (
        <Link href="/dashboard/tasks" className="mt-3 block text-xs text-muted-foreground hover:text-foreground">
          +{items.length - shown.length} more
        </Link>
      ) : null}
    </SectionCard>
  );
}

const EVENT_ICON: Record<string, ReactNode> = {
  task_approved: <BadgeCheck className="size-3.5 text-success" />,
  task_rejected: <XCircle className="size-3.5 text-destructive" />,
  sla_breached: <TriangleAlert className="size-3.5 text-destructive" />,
  worker_reaped: <Skull className="size-3.5 text-destructive" />,
  worker_killed: <Skull className="size-3.5 text-destructive" />,
  building_added: <Building2 className="size-3.5" />,
  building_ingested: <Building2 className="size-3.5" />,
  work_submitted: <FileText className="size-3.5" />,
};

function RecentActivityPanel({ events }: { events: readonly Event[] }) {
  const recent = [...events].sort((a, b) => (a.id > b.id ? -1 : 1)).slice(0, 8);

  return (
    <SectionCard
      title="Recent activity"
      action={recent.length > 0 ? <ActionLink href="/dashboard/activity">View all</ActionLink> : undefined}
    >
      {recent.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {recent.map((event) => (
            <li key={String(event.id)} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0 text-muted-foreground">
                {EVENT_ICON[event.kind] ?? <Activity className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{event.payload}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground/70">
                {relativeTimeAgo(event.at.toDate())}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function AgentsPanel({
  workers,
  tasks,
  now,
}: {
  workers: readonly Worker[];
  tasks: readonly Task[];
  now: Date | null;
}) {
  const live = [...workers].filter((worker) => worker.status !== "dead").sort((a, b) => (a.id < b.id ? -1 : 1));

  return (
    <SectionCard title="Agents" action={<ActionLink href="/dashboard/agents">Manage</ActionLink>}>
      {live.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No agents online.</p>
      ) : (
        <ul className="space-y-2.5">
          {live.map((worker) => {
            const currentTask =
              worker.currentTaskId !== undefined ? tasks.find((task) => task.id === worker.currentTaskId) : undefined;
            const working = worker.status === "working";

            return (
              <li key={String(worker.id)} className="flex items-center gap-2 text-xs">
                <StatusDot tone={working ? "success" : "muted"} pulse={working} label={worker.status} />
                <span className="shrink-0 font-medium">{worker.name}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {currentTask ? currentTask.title : "idle"}
                </span>
                {now ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground/70">
                    {relativeTimeAgo(worker.lastHeartbeat.toDate(), now)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useBuildings, useTasks } from "@/lib/data/hooks";

import { AddBuildingDialog } from "@/components/dashboard/AddBuildingDialog";
import { Meter } from "@/components/dashboard/Meter";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { Badge } from "@/components/ui/badge";
import { EmptyFolder } from "@/components/ui/empty-folder";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { computePeriods } from "@/lib/engine";
import { capSeverity, compactUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Building } from "@/lib/data/types";

type SortKey = "address" | "sqft" | "emissions" | "fine1" | "open";
type SortDirection = "asc" | "desc";

interface BuildingRow {
  building: Building;
  actual: number | null;
  limit: number | null;
  fine0: number | null;
  fine1: number | null;
  fine2: number | null;
  hasData: boolean;
  compliant: boolean;
  open: number;
}

export function BuildingsClient() {
  const buildings = useBuildings();
  const tasks = useTasks();
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "fine1",
    direction: "desc",
  });

  const rows = useMemo<BuildingRow[]>(
    () =>
      buildings.map((building) => {
        const periods = computePeriods(building);
        const open = tasks.filter((task) => task.buildingId === building.id && task.status === "open").length;

        return {
          building,
          actual: periods?.[0]?.actualEmissionsTco2e ?? null,
          limit: periods?.[0]?.emissionsLimitTco2e ?? null,
          fine0: periods ? periods[0].annualFineUsd : null,
          fine1: periods ? periods[1].annualFineUsd : null,
          fine2: periods ? periods[2].annualFineUsd : null,
          hasData: periods !== null,
          compliant: periods ? periods.every((period) => period.compliant) : false,
          open,
        };
      }),
    [buildings, tasks],
  );

  const sortedRows = useMemo(() => {
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case "address":
          return factor * a.building.address.localeCompare(b.building.address);
        case "sqft":
          return factor * (a.building.sqft - b.building.sqft);
        case "emissions":
          return factor * ((a.actual ?? -1) - (b.actual ?? -1));
        case "open":
          return factor * (a.open - b.open);
        default:
          return factor * ((a.fine1 ?? -1) - (b.fine1 ?? -1));
      }
    });
  }, [rows, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((previous) =>
      previous.key === key
        ? { key, direction: previous.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "address" ? "asc" : "desc" },
    );
  };

  if (buildings.length === 0) {
    return (
      <div className="@container/main flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-heading text-2xl font-bold tracking-tight">Buildings</h1>
          <AddBuildingDialog />
        </div>
        <EmptyFolder title="No buildings yet" description="Add an address to start a compliance plan." />
      </div>
    );
  }

  return (
    <div className="@container/main flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="font-heading text-2xl font-bold tracking-tight">Buildings</h1>
          <Badge variant="secondary" className="tabular-nums">
            {buildings.length}
          </Badge>
        </div>
        <AddBuildingDialog />
      </div>

      <TooltipProvider delayDuration={150}>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <SortHeader label="Address" sortKey="address" sort={sort} onSort={toggleSort} className="pl-4" />
                <SortHeader label="Sqft" sortKey="sqft" sort={sort} onSort={toggleSort} align="right" />
                <SortHeader label="Emissions" sortKey="emissions" sort={sort} onSort={toggleSort} align="right" />
                <TableHead className="text-right">Fine 24-29</TableHead>
                <SortHeader label="Fine 30-34" sortKey="fine1" sort={sort} onSort={toggleSort} align="right" />
                <TableHead className="text-right">Fine 35-39</TableHead>
                <TableHead>Status</TableHead>
                <SortHeader
                  label="Open"
                  sortKey="open"
                  sort={sort}
                  onSort={toggleSort}
                  align="right"
                  className="pr-4"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow
                  key={String(row.building.id)}
                  className="cursor-pointer tabular-nums"
                  onClick={() => router.push(`/dashboard/buildings/${row.building.id}`)}
                >
                  <TableCell className="pl-4 font-medium whitespace-nowrap [font-variant-numeric:normal]">
                    {row.building.address}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {row.building.sqft.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <EmissionsCell actual={row.actual} limit={row.limit} />
                  </TableCell>
                  <FineCell fine={row.fine0} />
                  <FineCell fine={row.fine1} emphasize />
                  <FineCell fine={row.fine2} />
                  <TableCell>
                    <StatusCell hasData={row.hasData} compliant={row.compliant} />
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {row.open > 0 ? (
                      <Badge variant="secondary">{row.open}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TooltipProvider>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; direction: SortDirection };
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === sortKey;

  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {active ? sort.direction === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
      </button>
    </TableHead>
  );
}

function EmissionsCell({ actual, limit }: { actual: number | null; limit: number | null }) {
  if (actual === null || limit === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground">-</span>
        </TooltipTrigger>
        <TooltipContent>No LL84 filing found</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <span>{Math.round(actual).toLocaleString()} t</span>
      <Meter
        fraction={limit > 0 ? actual / limit : 0}
        tone={capSeverity(actual, limit)}
        ariaLabel="Emissions against cap"
        className="w-16"
      />
    </div>
  );
}

function FineCell({ fine, emphasize }: { fine: number | null; emphasize?: boolean }) {
  if (fine === null) {
    return <TableCell className="text-right text-muted-foreground">-</TableCell>;
  }
  if (fine === 0) {
    return <TableCell className="text-right text-muted-foreground">$0</TableCell>;
  }

  return (
    <TableCell className={cn("text-right", emphasize ? "font-semibold text-destructive" : "text-foreground")}>
      {compactUsd(fine)}
    </TableCell>
  );
}

function StatusCell({ hasData, compliant }: { hasData: boolean; compliant: boolean }) {
  if (!hasData) {
    return <StatusPill tone="muted">No data</StatusPill>;
  }
  if (compliant) {
    return <StatusPill tone="success">Compliant</StatusPill>;
  }
  return <StatusPill tone="destructive">Over cap</StatusPill>;
}

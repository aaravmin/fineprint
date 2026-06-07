"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Building2, CircleDollarSign, ListTodo, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useReducer, useTable } from "spacetimedb/react";

import { AddressAutocomplete } from "@/components/address-autocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyFolder } from "@/components/ui/empty-folder";
import { LoadingDots } from "@/components/ui/loading-dots";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computePeriods, fmtUsd } from "@/lib/engine";
import { reducers, tables } from "@/module_bindings/index";
import type { Building, Task } from "@/module_bindings/types";

function ll97Fine(building: Building, periodIndex: number): number | null {
  const periods = computePeriods(building);
  return periods?.[periodIndex]?.annualFineUsd ?? null;
}

function openTaskCount(buildingId: bigint, tasks: readonly Task[]): number {
  return tasks.filter((t) => t.buildingId === buildingId && t.status === "open").length;
}

export function PortfolioClient() {
  const [buildings] = useTable(tables.building);
  const [tasks] = useTable(tables.task);
  const router = useRouter();
  const requestBuilding = useReducer(reducers.requestBuilding);
  const [address, setAddress] = useState("");
  const [requesting, setRequesting] = useState(false);

  async function submitAddress() {
    const trimmed = address.trim();
    if (!trimmed) {
      toast.error("Enter a street address with the borough");
      return;
    }

    setRequesting(true);
    try {
      await requestBuilding({ address: trimmed });
      toast.success("Intake queued — an agent is pulling the city's records now");
      setAddress("");
    } catch (error) {
      toast.error(`Request failed: ${(error as Error).message}`);
    } finally {
      setRequesting(false);
    }
  }

  const totalCurrent = buildings.reduce((sum, b) => sum + (ll97Fine(b, 0) ?? 0), 0);
  const total2030 = buildings.reduce((sum, b) => sum + (ll97Fine(b, 1) ?? 0), 0);
  const openTasks = tasks.filter((t) => t.status === "open").length;

  const sorted = [...buildings].sort((a, b) => (ll97Fine(b, 1) ?? 0) - (ll97Fine(a, 1) ?? 0));

  return (
    <div className="@container/main flex flex-col gap-6">
      {/* Hero */}
      <div className="space-y-1">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">NYC / Local Law 97</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Your building&apos;s real Local Law 97 carbon fine — and how to fix it
        </h1>
      </div>

      {/* Three-step explainer — same editorial rule treatment as the landing page. */}
      <div className="grid grid-cols-1 gap-6 @sm/main:grid-cols-3">
        <Step n="01" title="Enter your address" body="Any NYC building over 25,000 sq ft" />
        <Step n="02" title="See your real fine" body="Carbon penalties from public LL84 data + verified LL97 limits" />
        <Step
          n="03"
          title="Get a funded plan"
          body="Ranked retrofits matched to real rebates, driving the fine toward $0"
        />
      </div>

      {/* Address intake — the front door. The reducer dedupes; the new
          building and its obligations stream in over the live subscription. */}
      <Card>
        <CardContent className="flex flex-col gap-2 py-4 @sm/main:flex-row">
          <AddressAutocomplete
            value={address}
            onValueChange={setAddress}
            placeholder='Street address with borough, e.g. "350 5th Avenue, Manhattan"'
            className="flex-1"
            inputClassName="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button onClick={() => void submitAddress()} disabled={requesting} className="shrink-0">
            {requesting ? <LoadingDots>Queueing</LoadingDots> : "Get my number"}
          </Button>
        </CardContent>
      </Card>

      {/* Metric strip */}
      <div className="grid grid-cols-1 gap-3 @sm/main:grid-cols-2 @xl/main:grid-cols-4">
        <MetricTile icon={<Building2 className="size-4" />} label="Buildings" value={String(buildings.length)} />
        <MetricTile icon={<ListTodo className="size-4" />} label="Open tasks" value={String(openTasks)} />
        <MetricTile
          icon={<CircleDollarSign className="size-4" />}
          label="2024–2029 exposure"
          value={totalCurrent > 0 ? fmtUsd(totalCurrent) + "/yr" : "—"}
          danger={totalCurrent > 0}
        />
        <MetricTile
          icon={<TrendingUp className="size-4" />}
          label="2030–2034 exposure"
          value={total2030 > 0 ? fmtUsd(total2030) + "/yr" : "—"}
          danger={total2030 > 0}
          sub={total2030 > 0 && totalCurrent > 0 ? `${(total2030 / totalCurrent).toFixed(1)}× current` : undefined}
        />
      </div>

      {/* Buildings table */}
      <Card>
        <CardHeader>
          <CardTitle>Buildings</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sorted by 2030–2034 exposure. Click any row for the full fine analysis.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {buildings.length === 0 ? (
            <EmptyFolder
              title="No buildings yet"
              description={
                <>
                  Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run seed</code> to load
                  sample NYC buildings
                </>
              }
            />
          ) : (
            <Table className="tabular-nums">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="pl-6">Address</TableHead>
                  <TableHead className="text-right">Sqft</TableHead>
                  <TableHead className="text-right">Emissions</TableHead>
                  <TableHead className="text-right">2024–2029</TableHead>
                  <TableHead className="text-right">2030–2034</TableHead>
                  <TableHead className="text-right">2035–2039</TableHead>
                  <TableHead className="pr-6 text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((b) => {
                  const fine0 = ll97Fine(b, 0);
                  const fine1 = ll97Fine(b, 1);
                  const fine2 = ll97Fine(b, 2);
                  const open = openTaskCount(b.id, tasks);

                  return (
                    <TableRow
                      key={String(b.id)}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/buildings/${b.id}`)}
                    >
                      <TableCell className="pl-6 font-medium">{b.address}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{b.sqft.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {b.annualEmissionsTco2E !== undefined ? (
                          `${b.annualEmissionsTco2E.toLocaleString(undefined, { maximumFractionDigits: 0 })} t`
                        ) : (
                          <span className="text-xs">—</span>
                        )}
                      </TableCell>
                      <FineCell fine={fine0} />
                      <FineCell fine={fine1} highlight />
                      <FineCell fine={fine2} />
                      <TableCell className="pr-6 text-right">
                        {open > 0 ? (
                          <Badge variant="secondary">{open}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Legal disclaimer */}
      <p className="text-xs text-muted-foreground">
        Data sourced from NYC LL84 benchmarking submissions and LL97 emission limits (1 RCNY §103-14). Not legal advice
        — official compliance requires a registered design professional.
      </p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="border-t-2 border-foreground pt-3">
      <p className="font-heading text-xs font-semibold text-muted-foreground/70 tabular-nums">{n}</p>
      <p className="mt-1 text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  danger,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  danger?: boolean;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-background px-5 py-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span
          className={`flex size-7 items-center justify-center rounded-full ${danger ? "bg-destructive-subtle text-destructive" : "bg-secondary"}`}
        >
          {icon}
        </span>
        <p className="text-xs">{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${danger ? "text-destructive" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function FineCell({ fine, highlight }: { fine: number | null; highlight?: boolean }) {
  if (fine === null) {
    return <TableCell className="text-right text-muted-foreground">—</TableCell>;
  }
  if (fine === 0) {
    return <TableCell className="text-right text-xs font-medium text-success">$0</TableCell>;
  }
  return (
    <TableCell className={`text-right text-xs font-medium ${highlight ? "text-destructive" : ""}`}>
      {fmtUsd(fine)}
    </TableCell>
  );
}

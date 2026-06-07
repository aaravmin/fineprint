"use client";

import { useRouter } from "next/navigation";
import { useTable } from "spacetimedb/react";
import { tables } from "@/module_bindings/index";
import { computePeriods, fmtUsd } from "@/lib/engine";
import type { Building, Task } from "@/module_bindings/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function ll97Fine(building: Building, periodIndex: number): number | null {
  const periods = computePeriods(building);
  return periods?.[periodIndex]?.annualFineUsd ?? null;
}

function openTaskCount(buildingId: bigint, tasks: readonly Task[]): number {
  return tasks.filter(t => t.buildingId === buildingId && t.status === "open").length;
}

export function PortfolioClient() {
  const [buildings] = useTable(tables.building);
  const [tasks] = useTable(tables.task);
  const router = useRouter();

  const totalCurrent = buildings.reduce((sum, b) => sum + (ll97Fine(b, 0) ?? 0), 0);
  const total2030 = buildings.reduce((sum, b) => sum + (ll97Fine(b, 1) ?? 0), 0);
  const openTasks = tasks.filter(t => t.status === "open").length;

  const sorted = [...buildings].sort((a, b) => (ll97Fine(b, 1) ?? 0) - (ll97Fine(a, 1) ?? 0));

  return (
    <div className="@container/main flex flex-col gap-6">

      {/* Hero */}
      <div className="space-y-1">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          NYC · Local Law 97
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Your building&apos;s real Local Law 97 carbon fine — and how to fix it
        </h1>
      </div>

      {/* Three-step explainer */}
      <div className="grid grid-cols-1 gap-3 @sm/main:grid-cols-3">
        <Step n="1" title="Enter your address" body="Any NYC building over 25,000 sq ft" />
        <Step
          n="2"
          title="See your real fine"
          body="Carbon penalties from public LL84 data + verified LL97 limits"
        />
        <Step
          n="3"
          title="Get a funded plan"
          body="Ranked retrofits matched to real rebates, driving the fine toward $0"
        />
      </div>

      {/* Flat metric strip — no gradient */}
      <div className="grid grid-cols-1 gap-3 @sm/main:grid-cols-4">
        <MetricTile label="Buildings" value={String(buildings.length)} />
        <MetricTile label="Open tasks" value={String(openTasks)} />
        <MetricTile
          label="2024–2029 exposure"
          value={totalCurrent > 0 ? fmtUsd(totalCurrent) + "/yr" : "—"}
          danger={totalCurrent > 0}
        />
        <MetricTile
          label="2030–2034 exposure"
          value={total2030 > 0 ? fmtUsd(total2030) + "/yr" : "—"}
          danger={total2030 > 0}
          sub={
            total2030 > 0 && totalCurrent > 0
              ? `${(total2030 / totalCurrent).toFixed(1)}× current`
              : undefined
          }
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
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">No buildings yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Run{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono">npm run seed</code>{" "}
                to load sample NYC buildings with LL97 obligations.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Address</th>
                    <th className="px-6 py-3 font-medium text-right">Sqft</th>
                    <th className="px-6 py-3 font-medium text-right">Emissions</th>
                    <th className="px-6 py-3 font-medium text-right">2024–2029</th>
                    <th className="px-6 py-3 font-medium text-right">2030–2034</th>
                    <th className="px-6 py-3 font-medium text-right">2035–2039</th>
                    <th className="px-6 py-3 font-medium text-right">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(b => {
                    const fine0 = ll97Fine(b, 0);
                    const fine1 = ll97Fine(b, 1);
                    const fine2 = ll97Fine(b, 2);
                    const open = openTaskCount(b.id, tasks);

                    return (
                      <tr
                        key={String(b.id)}
                        className="border-b cursor-pointer transition-colors hover:bg-muted/30 last:border-0"
                        onClick={() => router.push(`/dashboard/buildings/${b.id}`)}
                      >
                        <td className="px-6 py-4 font-medium">{b.address}</td>
                        <td className="px-6 py-4 text-right text-muted-foreground">
                          {b.sqft.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right text-muted-foreground">
                          {b.annualEmissionsTco2E !== undefined
                            ? `${b.annualEmissionsTco2E.toLocaleString(undefined, { maximumFractionDigits: 0 })} t`
                            : <span className="text-xs">—</span>
                          }
                        </td>
                        <FineCell fine={fine0} />
                        <FineCell fine={fine1} highlight />
                        <FineCell fine={fine2} />
                        <td className="px-6 py-4 text-right">
                          {open > 0
                            ? <Badge variant="secondary">{open}</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legal disclaimer */}
      <p className="text-xs text-muted-foreground">
        Data sourced from NYC LL84 benchmarking submissions and LL97 emission limits
        (1 RCNY §103-14). Not legal advice — official compliance requires a registered
        design professional.
      </p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border bg-background px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">Step {n}</p>
      <p className="mt-1 text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function MetricTile({
  label,
  value,
  danger,
  sub,
}: {
  label: string;
  value: string;
  danger?: boolean;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-background px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${danger ? "text-destructive" : ""}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function FineCell({ fine, highlight }: { fine: number | null; highlight?: boolean }) {
  if (fine === null) {
    return <td className="px-6 py-4 text-right text-muted-foreground">—</td>;
  }
  if (fine === 0) {
    return (
      <td className="px-6 py-4 text-right text-xs font-medium text-success">
        $0
      </td>
    );
  }
  return (
    <td className={`px-6 py-4 text-right text-xs font-medium ${highlight ? "text-destructive" : ""}`}>
      {fmtUsd(fine)}
    </td>
  );
}

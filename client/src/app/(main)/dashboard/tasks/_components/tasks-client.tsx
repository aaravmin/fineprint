"use client";

import Link from "next/link";
import { useTable } from "spacetimedb/react";
import { tables } from "@/module_bindings/index";
import { fmtUsd } from "@/lib/engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "secondary",
  claimed: "outline",
  in_review: "outline",
  approved: "default",
  rejected: "destructive",
  done: "default",
};

export function TasksClient() {
  const [tasks] = useTable(tables.task);
  const [buildings] = useTable(tables.building);
  const [workers] = useTable(tables.worker);

  const sorted = [...tasks].sort((a, b) => {
    const statusOrder: Record<string, number> = { open: 0, claimed: 1, in_review: 2, approved: 3, rejected: 4, done: 5 };
    return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
  });

  const counts = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap gap-3">
        {Object.entries(counts).map(([status, count]) => (
          <Card key={status} className="px-4 py-3 flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>{status.replace("_", " ")}</Badge>
            <span className="font-semibold">{count}</span>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Task queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No tasks. Run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run seed</code>{" "}
              to create obligations.
            </div>
          ) : (
            <div className="divide-y">
              {sorted.map(task => {
                const building = buildings.find(b => b.id === task.buildingId);
                const claimedWorker = task.claimedBy !== undefined
                  ? workers.find(w => w.id === task.claimedBy)
                  : undefined;

                return (
                  <div key={String(task.id)} className="flex items-center gap-3 px-6 py-4">
                    <Badge variant={STATUS_VARIANT[task.status] ?? "secondary"} className="shrink-0">
                      {task.status.replace("_", " ")}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      {building && (
                        <Link
                          href={`/dashboard/buildings/${building.id}`}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          {building.address}
                        </Link>
                      )}
                    </div>
                    {claimedWorker && (
                      <span className="text-xs text-muted-foreground shrink-0">{claimedWorker.name}</span>
                    )}
                    {task.fineEstimateUsd !== undefined && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {fmtUsd(task.fineEstimateUsd)}/yr
                      </span>
                    )}
                    {task.slaBreached && (
                      <Badge variant="destructive" className="text-xs shrink-0">SLA</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

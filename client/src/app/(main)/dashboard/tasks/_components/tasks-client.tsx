"use client";

import { useState } from "react";

import Link from "next/link";

import { toast } from "sonner";
import { useReducer, useTable } from "spacetimedb/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyFolder } from "@/components/ui/empty-folder";
import { LoadingDots } from "@/components/ui/loading-dots";
import MultipleSelector, { type Option } from "@/components/ui/multiselect";
import { fmtUsd } from "@/lib/engine";
import { reducers, tables } from "@/module_bindings/index";

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

const STATUS_OPTIONS: Option[] = [
  { value: "open", label: "open" },
  { value: "claimed", label: "claimed" },
  { value: "in_review", label: "in review" },
  { value: "approved", label: "approved" },
  { value: "rejected", label: "rejected" },
  { value: "done", label: "done" },
];

export function TasksClient() {
  const [tasks] = useTable(tables.task);
  const [buildings] = useTable(tables.building);
  const [workers] = useTable(tables.worker);
  const approve = useReducer(reducers.approve);
  const reject = useReducer(reducers.reject);
  const [pendingTaskId, setPendingTaskId] = useState<bigint | null>(null);
  const [statusFilter, setStatusFilter] = useState<Option[]>([]);

  async function review(taskId: bigint, verdict: "approve" | "reject") {
    setPendingTaskId(taskId);
    try {
      if (verdict === "approve") {
        await approve({ taskId, note: "approved from the dashboard" });
        toast.success("Draft approved");
      } else {
        await reject({
          taskId,
          note: "rejected from the dashboard — returned to the queue",
        });
        toast("Draft rejected — task returned to the queue");
      }
    } catch (error) {
      toast.error(`Review failed: ${(error as Error).message}`);
    } finally {
      setPendingTaskId(null);
    }
  }

  const activeStatuses = statusFilter.map(option => option.value);

  const filtered =
    activeStatuses.length === 0
      ? tasks
      : tasks.filter(task => activeStatuses.includes(task.status));

  const sorted = [...filtered].sort((a, b) => {
    const statusOrder: Record<string, number> = {
      open: 0,
      claimed: 1,
      in_review: 2,
      approved: 3,
      rejected: 4,
      done: 5,
    };
    return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
  });

  const counts = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Task Queue</h1>

      <div className="flex flex-wrap gap-3">
        {Object.entries(counts).map(([status, count]) => (
          <Card key={status} className="flex items-center gap-2 px-4 py-3">
            <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>
              {status.replace("_", " ")}
            </Badge>
            <span className="font-semibold">{count}</span>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>Task queue</CardTitle>
          <MultipleSelector
            value={statusFilter}
            onChange={setStatusFilter}
            defaultOptions={STATUS_OPTIONS}
            placeholder="Filter by status…"
            hidePlaceholderWhenSelected
            emptyIndicator={
              <p className="text-center text-sm text-muted-foreground">
                No matching status
              </p>
            }
            className="max-w-md"
          />
        </CardHeader>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            tasks.length === 0 ? (
              <EmptyFolder
                title="No tasks in the queue"
                description="Tasks will appear as buildings are analyzed."
              />
            ) : (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                No tasks match the selected statuses.
              </div>
            )
          ) : (
            <div className="divide-y">
              {sorted.map(task => {
                const building = buildings.find(b => b.id === task.buildingId);
                const claimedWorker =
                  task.claimedBy !== undefined
                    ? workers.find(w => w.id === task.claimedBy)
                    : undefined;

                return (
                  <div
                    key={String(task.id)}
                    className="flex items-center gap-3 px-6 py-4"
                  >
                    <Badge
                      variant={STATUS_VARIANT[task.status] ?? "secondary"}
                      className="shrink-0"
                    >
                      {task.status.replace("_", " ")}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
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
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                        {claimedWorker.name}
                      </span>
                    )}
                    {task.fineEstimateUsd !== undefined && (
                      <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
                        {fmtUsd(task.fineEstimateUsd)}/yr
                      </span>
                    )}
                    {task.slaBreached && (
                      <Badge variant="destructive" className="shrink-0 text-xs">
                        SLA
                      </Badge>
                    )}
                    {task.status === "in_review" && (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          disabled={pendingTaskId === task.id}
                          onClick={() => review(task.id, "approve")}
                        >
                          {pendingTaskId === task.id ? <LoadingDots /> : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pendingTaskId === task.id}
                          onClick={() => review(task.id, "reject")}
                        >
                          Reject
                        </Button>
                      </div>
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

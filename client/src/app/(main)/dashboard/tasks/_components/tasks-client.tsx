"use client";

import { useState } from "react";

import Link from "next/link";

import { toast } from "sonner";
import { useReducer, useTable } from "spacetimedb/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyFolder } from "@/components/ui/empty-folder";
import { Label } from "@/components/ui/label";
import { LoadingDots } from "@/components/ui/loading-dots";
import MultipleSelector, { type Option } from "@/components/ui/multiselect";
import { Switch } from "@/components/ui/switch";
import { fmtUsd } from "@/lib/engine";
import { withAck } from "@/lib/reducer-call";
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

// Same dot-and-word treatment as the building page's compliance ledger.
const STATUS_DOT: Record<string, string> = {
  open: "bg-muted-foreground/50",
  claimed: "bg-foreground/70",
  in_review: "bg-amber-500",
  approved: "bg-success",
  done: "bg-success",
  rejected: "bg-destructive",
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
  const [settingsRows] = useTable(tables.settings);
  const approve = useReducer(reducers.approve);
  const reject = useReducer(reducers.reject);
  const markDone = useReducer(reducers.markDone);
  const setReviewMode = useReducer(reducers.setReviewMode);
  const [pendingTaskId, setPendingTaskId] = useState<bigint | null>(null);
  const [statusFilter, setStatusFilter] = useState<Option[]>([]);

  const reviewMode = settingsRows[0]?.reviewMode ?? "manual";

  function toggleReviewMode(autoEnabled: boolean) {
    const mode = autoEnabled ? "auto" : "manual";
    toast(
      autoEnabled
        ? "Auto-approve on. Obligation drafts approve on submit; intakes still wait for you"
        : "Manual review. Every draft waits for your sign-off",
    );
    withAck(setReviewMode({ mode }), "Review mode change").catch((error: Error) =>
      toast.error(`Could not change review mode: ${error.message}`),
    );
  }

  function review(taskId: bigint, verdict: "approve" | "reject") {
    setPendingTaskId(taskId);

    // Optimistic: the verdict toast fires on click; the buttons stay disabled
    // only until the server acks, and a refused reducer surfaces as an error.
    const call =
      verdict === "approve"
        ? approve({ taskId, note: "approved from the dashboard" })
        : reject({ taskId, note: "rejected from the dashboard; returned to the queue" });

    if (verdict === "approve") {
      toast.success("Draft approved");
    } else {
      toast("Draft rejected. Task returned to the queue");
    }

    withAck(call, "The review verdict")
      .catch((error: Error) => toast.error(`Review failed: ${error.message}`))
      .finally(() => setPendingTaskId(null));
  }

  function confirmFiled(taskId: bigint) {
    setPendingTaskId(taskId);
    toast.success("Filing confirmed");

    withAck(markDone({ taskId, note: "filing confirmed" }), "The filing")
      .catch((error: Error) => toast.error(`Could not close out: ${error.message}`))
      .finally(() => setPendingTaskId(null));
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Task Queue</h1>
        <div className="flex items-center gap-2">
          <Switch
            id="auto-approve"
            checked={reviewMode === "auto"}
            onCheckedChange={toggleReviewMode}
          />
          <Label htmlFor="auto-approve" className="text-sm text-muted-foreground">
            Auto-approve drafts
            <span className="hidden text-xs sm:inline"> (intakes always manual)</span>
          </Label>
        </div>
      </div>

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
                    className="grid grid-cols-[1fr_auto] items-center gap-3 px-6 py-3.5 transition-colors duration-200 hover:bg-muted/40 sm:grid-cols-[7.5rem_1fr_7rem_6.5rem_auto]"
                  >
                    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[task.status] ?? "bg-muted-foreground/50"}`}
                      />
                      {task.status.replace("_", " ")}
                    </span>

                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        <span className="truncate">{task.title}</span>
                        {task.slaBreached && (
                          <Badge variant="destructive" className="shrink-0 text-[10px]">
                            SLA
                          </Badge>
                        )}
                      </p>
                      {building && (
                        <Link
                          href={`/dashboard/buildings/${building.id}`}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          {building.address}
                        </Link>
                      )}
                    </div>

                    <span className="hidden truncate text-right text-xs text-muted-foreground sm:inline">
                      {claimedWorker?.name ?? ""}
                    </span>

                    <span className="hidden text-right text-xs text-muted-foreground tabular-nums sm:inline">
                      {task.fineEstimateUsd !== undefined
                        ? `${fmtUsd(task.fineEstimateUsd)}/yr`
                        : ""}
                    </span>

                    <div className="flex shrink-0 justify-end gap-2">
                      {task.status === "in_review" && (
                        <>
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
                        </>
                      )}
                      {task.status === "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pendingTaskId === task.id}
                          onClick={() => confirmFiled(task.id)}
                        >
                          Mark filed
                        </Button>
                      )}
                    </div>
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

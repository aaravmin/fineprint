"use client";

import { useState } from "react";

import Link from "next/link";

import { toast } from "sonner";

import { DaysLeftPill } from "@/components/dashboard/DaysLeftPill";
import { StatusDot, type StatusTone } from "@/components/dashboard/StatusPill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyFolder } from "@/components/ui/empty-folder";
import { Label } from "@/components/ui/label";
import { LoadingDots } from "@/components/ui/loading-dots";
import MultipleSelector, { type Option } from "@/components/ui/multiselect";
import { Switch } from "@/components/ui/switch";
import { categoryIconFor, categoryLabel } from "@/lib/categories/trackedCategories";
import {
  useBuildings,
  useSettingsRows,
  useSubmissions,
  useTasks,
  useTrackedCategories,
  useWorkers,
} from "@/lib/data/hooks";
import { useApprove, useMarkDone, useReject, useSetReviewMode } from "@/lib/data/mutations";
import type { Task } from "@/lib/data/types";
import { fmtUsd } from "@/lib/engine";
import { withAck } from "@/lib/reducer-call";

const TERMINAL_TASK_STATUSES = new Set(["done", "rejected"]);

function taskTone(status: string): StatusTone {
  if (status === "approved" || status === "done") {
    return "success";
  }
  if (status === "rejected") {
    return "destructive";
  }
  if (status === "in_review") {
    return "warning";
  }
  return "muted";
}

const STATUS_OPTIONS: Option[] = [
  { value: "open", label: "open" },
  { value: "claimed", label: "claimed" },
  { value: "in_review", label: "in review" },
  { value: "approved", label: "approved" },
  { value: "rejected", label: "rejected" },
  { value: "done", label: "done" },
];

export function TasksClient() {
  const tasks = useTasks();
  const buildings = useBuildings();
  const submissions = useSubmissions();
  const workers = useWorkers();
  const settingsRows = useSettingsRows();
  const { isTracked } = useTrackedCategories();
  const approve = useApprove();
  const reject = useReject();
  const markDone = useMarkDone();
  const setReviewMode = useSetReviewMode();
  const [pendingTaskId, setPendingTaskId] = useState<bigint | null>(null);
  const [statusFilter, setStatusFilter] = useState<Option[]>([]);
  const [showUntracked, setShowUntracked] = useState(false);

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

  function review(task: Task, verdict: "approve" | "reject") {
    if (verdict === "approve" && task.kind === "building_intake") {
      const latestSubmission = submissions
        .filter((submission) => submission.taskId === task.id)
        .sort((a, b) => (a.id > b.id ? -1 : 1))[0];

      if (!latestSubmission?.payloadJson) {
        toast.error("This intake did not produce building data", {
          description: "Reject it, then re-request the address.",
        });
        return;
      }
    }

    setPendingTaskId(task.id);

    const call =
      verdict === "approve"
        ? approve({ taskId: task.id, note: "approved from the dashboard" })
        : reject({ taskId: task.id, note: "rejected from the dashboard; returned to the queue" });

    withAck(call, "The review verdict")
      .then(() => {
        if (verdict === "approve") {
          toast.success("Draft approved");
        } else {
          toast("Draft rejected. Task returned to the queue");
        }
      })
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

  const activeStatuses = statusFilter.map((option) => option.value);

  function toggleStatus(status: string) {
    setStatusFilter((current) => {
      const alreadyActive = current.some((option) => option.value === status);
      if (alreadyActive) {
        return current.filter((option) => option.value !== status);
      }

      const option = STATUS_OPTIONS.find((candidate) => candidate.value === status);
      return option ? [...current, option] : current;
    });
  }

  const statusFiltered =
    activeStatuses.length === 0 ? tasks : tasks.filter((task) => activeStatuses.includes(task.status));

  const filtered = showUntracked ? statusFiltered : statusFiltered.filter((task) => isTracked(task.category));

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
        <h1 className="font-heading text-2xl font-bold tracking-tight">Tasks</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="show-untracked" checked={showUntracked} onCheckedChange={setShowUntracked} />
            <Label htmlFor="show-untracked" className="text-sm text-muted-foreground">
              Show untracked
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="auto-approve" checked={reviewMode === "auto"} onCheckedChange={toggleReviewMode} />
            <Label htmlFor="auto-approve" className="text-sm text-muted-foreground">
              Auto-approve drafts
              <span className="hidden text-xs sm:inline"> (intakes always manual)</span>
            </Label>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {Object.entries(counts).map(([status, count]) => {
          const isActive = activeStatuses.includes(status);

          return (
            <Card
              key={status}
              role="button"
              aria-pressed={isActive}
              onClick={() => toggleStatus(status)}
              className="flex cursor-pointer items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <Badge variant={isActive ? "default" : "outline"}>{status.replace("_", " ")}</Badge>
              <span className="font-semibold">{count}</span>
            </Card>
          );
        })}
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
            emptyIndicator={<p className="text-center text-sm text-muted-foreground">No matching status</p>}
            className="max-w-md"
          />
        </CardHeader>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            tasks.length === 0 ? (
              <EmptyFolder title="No tasks in the queue" description="Tasks will appear as buildings are analyzed." />
            ) : (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                No tasks match the selected statuses.
              </div>
            )
          ) : (
            <div className="divide-y">
              {sorted.map((task) => {
                const building = buildings.find((b) => b.id === task.buildingId);
                const claimedWorker =
                  task.claimedBy !== undefined ? workers.find((w) => w.id === task.claimedBy) : undefined;
                const trackedRow = isTracked(task.category);
                const CategoryIcon = categoryIconFor(task.category);

                return (
                  <div
                    key={String(task.id)}
                    className={`grid grid-cols-[1fr_auto] items-center gap-3 px-6 py-3.5 transition-colors duration-200 hover:bg-muted/40 sm:grid-cols-[7.5rem_1fr_7rem_6.5rem_auto] ${trackedRow ? "" : "opacity-50"}`}
                  >
                    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                      <StatusDot tone={taskTone(task.status)} label={task.status.replace("_", " ")} />
                      {task.status.replace("_", " ")}
                    </span>

                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        <span className="truncate">{task.title}</span>
                        <Badge variant="outline" className="shrink-0 gap-1 text-[10px] font-normal">
                          <CategoryIcon className="size-3" />
                          {categoryLabel(task.category)}
                        </Badge>
                        {task.slaBreached && (
                          <Badge variant="destructive" className="shrink-0 text-[10px]">
                            SLA
                          </Badge>
                        )}
                        {!TERMINAL_TASK_STATUSES.has(task.status) && (
                          <DaysLeftPill date={task.deadline.toDate()} className="shrink-0" />
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
                      {task.fineEstimateUsd !== undefined ? `${fmtUsd(task.fineEstimateUsd)}/yr` : ""}
                    </span>

                    <div className="flex shrink-0 justify-end gap-2">
                      {task.status === "in_review" && (
                        <>
                          <Button
                            size="sm"
                            disabled={pendingTaskId === task.id}
                            onClick={() => review(task, "approve")}
                          >
                            {pendingTaskId === task.id ? <LoadingDots /> : "Approve"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pendingTaskId === task.id}
                            onClick={() => review(task, "reject")}
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

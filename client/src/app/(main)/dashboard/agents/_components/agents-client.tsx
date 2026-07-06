"use client";

import { useState } from "react";

import { Bot, CircleDot, Skull, Zap } from "lucide-react";
import { toast } from "sonner";

import { useTasks, useWorkers } from "@/lib/data/hooks";
import { useKillWorker, usePruneDeadWorkers } from "@/lib/data/mutations";

import { StatusDot, type StatusTone } from "@/components/dashboard/StatusPill";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyFolder } from "@/components/ui/empty-folder";
import { LoadingDots } from "@/components/ui/loading-dots";
import { relativeTimeAgo } from "@/lib/format";
import { withAck } from "@/lib/reducer-call";

function workerTone(status: string): StatusTone {
  if (status === "working") {
    return "success";
  }
  if (status === "dead") {
    return "destructive";
  }
  return "muted";
}

export function AgentsClient() {
  const workers = useWorkers();
  const tasks = useTasks();
  const killWorker = useKillWorker();
  const pruneDeadWorkers = usePruneDeadWorkers();
  const [killingId, setKillingId] = useState<bigint | null>(null);
  const [showDead, setShowDead] = useState(false);

  function kill(workerId: bigint, name: string) {
    setKillingId(workerId);
    toast(`${name} killed. Its task returns to the queue`);

    withAck(killWorker({ workerId }), "The kill order")
      .catch((error: Error) => toast.error(`Kill failed: ${error.message}`))
      .finally(() => setKillingId(null));
  }

  function clearDead() {
    toast("Clearing dead agents");
    withAck(pruneDeadWorkers(), "The cleanup").catch((error: Error) => toast.error(`Cleanup failed: ${error.message}`));
  }

  // Per-task agents leave one dead row each; hide them unless asked.
  const visibleWorkers = showDead ? workers : workers.filter((w) => w.status !== "dead");
  const sorted = [...visibleWorkers].sort((a, b) => (a.id < b.id ? -1 : 1));

  const idle = workers.filter((w) => w.status === "idle").length;
  const working = workers.filter((w) => w.status === "working").length;
  const dead = workers.filter((w) => w.status === "dead").length;

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Agents</h1>

      <div className="grid grid-cols-1 gap-3 @sm/main:grid-cols-3 @sm/main:gap-4">
        <StatCard
          icon={<CircleDot className="size-4" />}
          iconClassName="bg-secondary text-muted-foreground"
          label="Idle"
          value={idle}
        />
        <StatCard
          icon={<Zap className="size-4" />}
          iconClassName="bg-success/10 text-success"
          label="Working"
          value={working}
          pulse={working > 0}
        />
        <StatCard
          icon={<Skull className="size-4" />}
          iconClassName="bg-destructive-subtle text-destructive"
          label="Dead"
          value={dead}
          valueClassName={dead > 0 ? "text-destructive" : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Fleet</CardTitle>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowDead((previous) => !previous)}>
                {showDead ? "Hide dead" : `Show dead (${dead})`}
              </Button>
              {dead > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={clearDead}>
                  Clear dead
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <EmptyFolder title="No agents connected" description="Connected agents will appear here in real time." />
          ) : (
            <div className="divide-y">
              {sorted.map((w) => {
                const currentTask =
                  w.currentTaskId !== undefined ? tasks.find((t) => t.id === w.currentTaskId) : undefined;

                return (
                  <div key={String(w.id)} className="flex items-center gap-4 px-6 py-4">
                    <Avatar className="size-9">
                      <AvatarFallback
                        className={w.status === "dead" ? "bg-destructive-subtle text-destructive" : "bg-secondary"}
                      >
                        {w.status === "dead" ? <Skull className="size-4" /> : <Bot className="size-4" />}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{w.name}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <StatusDot tone={workerTone(w.status)} pulse={w.status === "working"} label={w.status} />
                          {w.status}
                        </span>
                      </div>
                      {currentTask && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{currentTask.title}</p>
                      )}
                    </div>

                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {relativeTimeAgo(w.lastHeartbeat.toDate())}
                    </span>
                    {w.status !== "dead" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={killingId === w.id}
                        onClick={() => kill(w.id, w.name)}
                      >
                        {killingId === w.id ? (
                          <LoadingDots />
                        ) : (
                          <>
                            <Skull className="size-3.5" /> Kill
                          </>
                        )}
                      </Button>
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

function StatCard({
  icon,
  iconClassName,
  label,
  value,
  valueClassName,
  pulse,
}: {
  icon: React.ReactNode;
  iconClassName: string;
  label: string;
  value: number;
  valueClassName?: string;
  pulse?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span
            className={`flex size-7 items-center justify-center rounded-full ${iconClassName} ${pulse ? "animate-pulse" : ""}`}
          >
            {icon}
          </span>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-semibold tabular-nums ${valueClassName ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

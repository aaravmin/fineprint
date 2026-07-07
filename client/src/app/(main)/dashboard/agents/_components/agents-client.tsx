"use client";

import { useState } from "react";

import { Bot, CircleDot, Skull, Zap } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyFolder } from "@/components/ui/empty-folder";
import { tables } from "@/lib/db";
import { useTable } from "@/lib/db/react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  idle: "secondary",
  working: "default",
  dead: "destructive",
};

export function AgentsClient() {
  const [workers] = useTable(tables.worker);
  const [tasks] = useTable(tables.task);
  const [showDead, setShowDead] = useState(false);

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
          iconClassName="bg-[var(--success)]/10 text-[var(--success)]"
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
                        <Badge variant={STATUS_VARIANT[w.status] ?? "secondary"}>
                          {w.status === "working" && (
                            <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-[var(--success)]" />
                          )}
                          {w.status}
                        </Badge>
                      </div>
                      {currentTask && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{currentTask.title}</p>
                      )}
                    </div>

                    <span className="hidden font-mono text-xs text-muted-foreground sm:inline">#{String(w.id)}</span>
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

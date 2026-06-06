"use client";

import { useTable } from "spacetimedb/react";
import { tables } from "@/module_bindings/index";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  idle: "secondary",
  working: "default",
  dead: "destructive",
};

export function AgentsClient() {
  const [workers] = useTable(tables.worker);
  const [tasks] = useTable(tables.task);

  const sorted = [...workers].sort((a, b) => (a.id < b.id ? -1 : 1));

  const idle = workers.filter(w => w.status === "idle").length;
  const working = workers.filter(w => w.status === "working").length;
  const dead = workers.filter(w => w.status === "dead").length;

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Idle</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{idle}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Working</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-primary">{working}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dead</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-destructive">{dead}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fleet</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No workers connected. Run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run worker</code>{" "}
              to start an agent.
            </div>
          ) : (
            <div className="divide-y">
              {sorted.map(w => {
                const currentTask = w.currentTaskId !== undefined
                  ? tasks.find(t => t.id === w.currentTaskId)
                  : undefined;

                return (
                  <div key={String(w.id)} className="flex items-center gap-4 px-6 py-4">
                    <Badge variant={STATUS_VARIANT[w.status] ?? "secondary"}>
                      {w.status}
                    </Badge>
                    <span className="flex-1 font-medium text-sm">{w.name}</span>
                    {currentTask && (
                      <span className="text-xs text-muted-foreground truncate max-w-xs">
                        {currentTask.title}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground font-mono">
                      {w.identity.toHexString().slice(0, 8)}…
                    </span>
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

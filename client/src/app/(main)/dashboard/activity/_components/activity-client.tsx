"use client";

import { useTable } from "spacetimedb/react";
import { tables } from "@/module_bindings/index";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const KIND_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  task_claimed: "default",
  work_submitted: "outline",
  task_approved: "default",
  task_rejected: "destructive",
  worker_registered: "secondary",
  worker_reaped: "destructive",
  worker_killed: "destructive",
  sla_breached: "destructive",
  building_added: "secondary",
  building_ingested: "secondary",
  heartbeat: "outline",
  system: "secondary",
};

export function ActivityClient() {
  const [events] = useTable(tables.event);

  const sorted = [...events].sort((a, b) => (a.id > b.id ? -1 : 1)).slice(0, 100);

  return (
    <div className="@container/main">
      <Card>
        <CardHeader>
          <CardTitle>Activity log</CardTitle>
          <p className="text-sm text-muted-foreground">Last 100 events, newest first.</p>
        </CardHeader>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No events yet.
            </div>
          ) : (
            <div className="divide-y font-mono text-xs">
              {sorted.map(e => (
                <div key={String(e.id)} className="flex items-start gap-3 px-6 py-3">
                  <span className="shrink-0 text-muted-foreground w-20 pt-0.5">
                    {e.at.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <Badge variant={KIND_VARIANT[e.kind] ?? "secondary"} className="shrink-0 text-[10px]">
                    {e.kind.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-muted-foreground leading-relaxed">{e.payload}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

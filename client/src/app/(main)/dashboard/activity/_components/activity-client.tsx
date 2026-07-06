"use client";

import type React from "react";

import {
  Activity,
  BadgeCheck,
  Building2,
  Cog,
  FileText,
  Hand,
  HeartPulse,
  Skull,
  TriangleAlert,
  UserPlus,
  XCircle,
} from "lucide-react";
import { useEvents } from "@/lib/data/hooks";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyFolder } from "@/components/ui/empty-folder";
import { relativeTimeAgo } from "@/lib/format";

interface KindStyle {
  icon: React.ReactNode;
  ring: string;
  variant: "default" | "secondary" | "destructive" | "outline";
}

const KIND_STYLE: Record<string, KindStyle> = {
  task_claimed: {
    icon: <Hand className="size-3.5" />,
    ring: "bg-secondary text-foreground",
    variant: "default",
  },
  work_submitted: {
    icon: <FileText className="size-3.5" />,
    ring: "bg-secondary text-foreground",
    variant: "outline",
  },
  task_approved: {
    icon: <BadgeCheck className="size-3.5" />,
    ring: "bg-success/10 text-success",
    variant: "default",
  },
  task_rejected: {
    icon: <XCircle className="size-3.5" />,
    ring: "bg-destructive-subtle text-destructive",
    variant: "destructive",
  },
  worker_registered: {
    icon: <UserPlus className="size-3.5" />,
    ring: "bg-secondary text-foreground",
    variant: "secondary",
  },
  worker_reaped: {
    icon: <Skull className="size-3.5" />,
    ring: "bg-destructive-subtle text-destructive",
    variant: "destructive",
  },
  worker_killed: {
    icon: <Skull className="size-3.5" />,
    ring: "bg-destructive-subtle text-destructive",
    variant: "destructive",
  },
  sla_breached: {
    icon: <TriangleAlert className="size-3.5" />,
    ring: "bg-destructive-subtle text-destructive",
    variant: "destructive",
  },
  building_added: {
    icon: <Building2 className="size-3.5" />,
    ring: "bg-secondary text-foreground",
    variant: "secondary",
  },
  building_ingested: {
    icon: <Building2 className="size-3.5" />,
    ring: "bg-secondary text-foreground",
    variant: "secondary",
  },
  heartbeat: {
    icon: <HeartPulse className="size-3.5" />,
    ring: "bg-secondary text-muted-foreground",
    variant: "outline",
  },
  system: {
    icon: <Cog className="size-3.5" />,
    ring: "bg-secondary text-muted-foreground",
    variant: "secondary",
  },
};

const FALLBACK_STYLE: KindStyle = {
  icon: <Activity className="size-3.5" />,
  ring: "bg-secondary text-muted-foreground",
  variant: "secondary",
};

export function ActivityClient() {
  const events = useEvents();

  const sorted = [...events].sort((a, b) => (a.id > b.id ? -1 : 1)).slice(0, 100);

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Activity</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Activity log</CardTitle>
            <Badge variant="secondary" className="tabular-nums">
              {sorted.length} events
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <EmptyFolder title="No events yet" description="Reducer calls write the audit trail here in real time" />
          ) : (
            <ul className="relative">
              {/* Timeline rail */}
              <span aria-hidden="true" className="absolute inset-y-3 left-[2.375rem] w-px bg-border" />
              {sorted.map((e) => {
                const style = KIND_STYLE[e.kind] ?? FALLBACK_STYLE;

                return (
                  <li
                    key={String(e.id)}
                    className="relative flex items-start gap-3 px-6 py-3 transition-colors hover:bg-muted/40"
                  >
                    <span
                      className={`relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-card ${style.ring}`}
                    >
                      {style.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={style.variant} className="text-[10px]">
                          {e.kind.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {relativeTimeAgo(e.at.toDate())}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{e.payload}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

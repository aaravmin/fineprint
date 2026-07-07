"use client";

import { useEffect, useState } from "react";

import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { tables } from "@/lib/db";
import { useTable } from "@/lib/db/react";
import type { Event } from "@/lib/db/types";

const SEEN_STORAGE_KEY = "fp_notifications_seen_id";

// Heartbeats and module-lifecycle rows are noise; the inbox never shows them.
const SILENT_KINDS = new Set(["heartbeat", "system"]);
const ERROR_KINDS = new Set(["task_rejected", "worker_killed", "worker_reaped", "sla_breached", "intake_failed"]);
const SUCCESS_KINDS = new Set(["task_approved", "building_ingested"]);

function dotColor(kind: string): string {
  if (ERROR_KINDS.has(kind)) {
    return "bg-destructive";
  }
  if (SUCCESS_KINDS.has(kind)) {
    return "bg-success";
  }
  return "bg-muted-foreground/40";
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

// A Vercel-style notifications inbox living in the top-right of the dashboard
// header. It reads the same event audit trail the activity page renders, and
// surfaces a live "agents offline" line so the old top-of-page banner has a
// home without pushing content down.
export function NotificationsButton() {
  const [events] = useTable(tables.event);
  const [workers] = useTable(tables.worker);

  const [seenId, setSeenId] = useState<number>(0);

  useEffect(() => {
    const stored = window.localStorage.getItem(SEEN_STORAGE_KEY);
    if (stored) {
      setSeenId(Number(stored));
    }
  }, []);

  const visible: Event[] = [...events]
    .filter((event) => !SILENT_KINDS.has(event.kind))
    .sort((a, b) => (a.id > b.id ? -1 : 1))
    .slice(0, 20);

  const latestId = visible.reduce((max, event) => (event.id > max ? event.id : max), 0);
  const unread = visible.filter((event) => event.id > seenId).length;

  const agentsOnline = workers.filter((worker) => worker.status !== "dead").length;

  function markAllSeen() {
    setSeenId(latestId);
    window.localStorage.setItem(SEEN_STORAGE_KEY, String(latestId));
  }

  return (
    <Popover
      onOpenChange={(open: boolean) => {
        if (open) {
          markAllSeen();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="relative" aria-label="Notifications">
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-2 items-center justify-center rounded-full bg-destructive ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`size-1.5 rounded-full ${agentsOnline > 0 ? "bg-success" : "bg-destructive"}`} />
            {agentsOnline > 0 ? `${agentsOnline} online` : "agents offline"}
          </span>
        </div>

        {agentsOnline === 0 && (
          <div className="border-b border-border bg-destructive-subtle px-4 py-2.5 text-xs text-destructive">
            No agents online. Queued work waits until a worker connects.
          </div>
        )}

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
            <Bell className="size-5 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Nothing yet</p>
          </div>
        ) : (
          <ScrollArea className="max-h-80">
            <ul className="divide-y divide-border">
              {visible.map((event) => (
                <li key={String(event.id)} className="flex gap-2.5 px-4 py-3">
                  <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${dotColor(event.kind)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-foreground">{event.payload}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                      {timeAgo(event.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

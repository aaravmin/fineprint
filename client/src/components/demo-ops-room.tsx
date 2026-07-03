"use client";

import type React from "react";
import { useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, BadgeCheck, Bot, Building2, FileText, Hand, RotateCcw, UserPlus, XCircle, Zap } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// The Agents fleet and Activity log from the dashboard — the exact same row
// markup — side by side, driven by one dispatch button. Each click advances a
// scripted portfolio run: an agent picks up (or finishes) work and the same
// beat animates into the activity feed, so both panels move in unison.

interface Worker {
  name: string;
  status: "idle" | "working";
  task?: string;
  hex: string;
}

interface Event {
  id: number;
  kind: string;
  time: string;
  payload: string;
}

const INITIAL_WORKERS: Worker[] = [
  { name: "atlas", status: "idle", hex: "a1f4c92e" },
  { name: "nyx", status: "idle", hex: "7b0d3e88" },
  { name: "orion", status: "idle", hex: "3c6a1f57" },
  { name: "vega", status: "idle", hex: "e2904bd1" },
  { name: "echo", status: "idle", hex: "5d17aa60" },
];

const INITIAL_EVENTS: Event[] = [
  {
    id: 0,
    kind: "building_ingested",
    time: "14:26",
    payload: "350 5th Ave ingested — 6 obligations created",
  },
];

interface Step {
  worker: string;
  status: "idle" | "working";
  task?: string;
  time: string;
  kind: string;
  payload: string;
}

const STEPS: Step[] = [
  {
    worker: "atlas",
    status: "working",
    task: "LL97 over-cap remediation",
    time: "14:30",
    kind: "task_claimed",
    payload: 'atlas claimed "LL97 over-cap remediation"',
  },
  {
    worker: "nyx",
    status: "working",
    task: "LL84 benchmarking filing",
    time: "14:31",
    kind: "task_claimed",
    payload: 'nyx claimed "LL84 benchmarking"',
  },
  {
    worker: "orion",
    status: "working",
    task: "LL11 facade inspection",
    time: "14:32",
    kind: "task_claimed",
    payload: 'orion claimed "LL11 facade inspection"',
  },
  {
    worker: "atlas",
    status: "idle",
    time: "14:33",
    kind: "work_submitted",
    payload: 'atlas submitted "LL97 over-cap remediation" — in review',
  },
  {
    worker: "vega",
    status: "working",
    task: "LL152 gas piping certification",
    time: "14:34",
    kind: "task_claimed",
    payload: 'vega claimed "LL152 gas piping cert"',
  },
  {
    worker: "nyx",
    status: "idle",
    time: "14:35",
    kind: "task_approved",
    payload: '"LL84 benchmarking" approved',
  },
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  idle: "secondary",
  working: "default",
};

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
    ring: "bg-[var(--success)]/10 text-[var(--success)]",
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
  building_ingested: {
    icon: <Building2 className="size-3.5" />,
    ring: "bg-secondary text-foreground",
    variant: "secondary",
  },
};

const FALLBACK_STYLE: KindStyle = {
  icon: <Activity className="size-3.5" />,
  ring: "bg-secondary text-muted-foreground",
  variant: "secondary",
};

export function DemoOpsRoom() {
  const [workers, setWorkers] = useState<Worker[]>(INITIAL_WORKERS);
  const [events, setEvents] = useState<Event[]>(INITIAL_EVENTS);
  const [step, setStep] = useState(0);

  const done = step >= STEPS.length;
  const working = workers.filter((worker) => worker.status === "working").length;

  function dispatch() {
    if (done) {
      setWorkers(INITIAL_WORKERS);
      setEvents(INITIAL_EVENTS);
      setStep(0);
      return;
    }

    const next = STEPS[step];

    setWorkers((current) =>
      current.map((worker) =>
        worker.name === next.worker ? { ...worker, status: next.status, task: next.task } : worker,
      ),
    );
    setEvents((current) =>
      [{ id: step + 1, kind: next.kind, time: next.time, payload: next.payload }, ...current].slice(0, 7),
    );
    setStep(step + 1);
  }

  return (
    <div className="@container/main space-y-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <motion.span
            key={working}
            initial={{ scale: 1.6 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3 }}
            className={`inline-block size-1.5 rounded-full ${working > 0 ? "animate-pulse bg-[var(--success)]" : "bg-muted-foreground/40"}`}
          />
          {working} agents working
        </span>
        <button
          type="button"
          onClick={dispatch}
          className="fp-press inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {done ? (
            <>
              <RotateCcw className="size-4" /> Replay
            </>
          ) : (
            <>
              <Zap className="size-4" /> Dispatch agent
            </>
          )}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Fleet — the exact Agents-page rows */}
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base">Current agents</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {workers.map((worker) => (
                <motion.div layout key={worker.name} className="flex items-center gap-4 px-6 py-3.5">
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-secondary">
                      <Bot className="size-4" />
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{worker.name}</span>
                      <Badge variant={STATUS_VARIANT[worker.status] ?? "secondary"}>
                        {worker.status === "working" && (
                          <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-[var(--success)]" />
                        )}
                        {worker.status}
                      </Badge>
                    </div>
                    <AnimatePresence mode="wait">
                      {worker.task && (
                        <motion.p
                          key={worker.task}
                          initial={{ opacity: 0, y: -3 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="mt-0.5 truncate text-xs text-muted-foreground"
                        >
                          {worker.task}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{worker.hex}</span>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Activity log — the exact Activity-page timeline */}
        <Card>
          <CardHeader className="py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent activity</CardTitle>
              <Badge variant="secondary" className="tabular-nums">
                {events.length} events
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="relative">
              <span aria-hidden="true" className="absolute inset-y-3 left-[2.375rem] w-px bg-border" />
              <AnimatePresence initial={false}>
                {events.map((event) => {
                  const style = KIND_STYLE[event.kind] ?? FALLBACK_STYLE;

                  return (
                    <motion.li
                      layout
                      key={event.id}
                      initial={{ opacity: 0, y: -12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
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
                            {event.kind.replace(/_/g, " ")}
                          </Badge>
                          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{event.time}</span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{event.payload}</p>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

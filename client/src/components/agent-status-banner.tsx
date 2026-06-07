"use client";

import { TriangleAlert } from "lucide-react";
import { useTable } from "spacetimedb/react";

import { tables } from "@/module_bindings/index";

// Without a live worker the queue silently dead-ends: intakes sit open
// forever and nothing in the UI says why. This strip says why — but it speaks
// to whoever runs the workers, so it stays a development-only aid. In a
// deployed build a regular user can't act on "npm run worker", so we never
// show it to them; keeping workers alive is an operations concern there.
export function AgentStatusBanner() {
  const [workers] = useTable(tables.worker);

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const aliveWorkers = workers.filter(worker => worker.status !== "dead");
  if (aliveWorkers.length > 0) {
    return null;
  }

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive-subtle px-4 py-2.5 text-sm text-destructive md:mb-6">
      <TriangleAlert className="size-4 shrink-0" />
      <p>
        No agents online. Queued work waits until a worker connects (
        <code className="font-mono text-xs">npm run worker</code>).
      </p>
    </div>
  );
}

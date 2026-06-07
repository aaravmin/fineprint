"use client";

import { TriangleAlert } from "lucide-react";
import { useTable } from "spacetimedb/react";

import { tables } from "@/module_bindings/index";

// Without a live worker the queue silently dead-ends: intakes sit open
// forever and nothing in the UI says why. This strip says why.
export function AgentStatusBanner() {
  const [workers] = useTable(tables.worker);

  const aliveWorkers = workers.filter(worker => worker.status !== "dead");
  if (aliveWorkers.length > 0) {
    return null;
  }

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive-subtle px-4 py-2.5 text-sm text-destructive md:mb-6">
      <TriangleAlert className="size-4 shrink-0" />
      <p>
        No agents online — queued work will wait until a worker connects (
        <code className="font-mono text-xs">npm run worker</code>).
      </p>
    </div>
  );
}

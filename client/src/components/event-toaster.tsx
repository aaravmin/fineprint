"use client";

import { useEffect, useRef } from "react";

import { toast } from "sonner";
import { useEvents } from "@/lib/data/hooks";

// Every reducer writes an event row; this turns the rows that matter into
// toasts. The audit trail is the single source: nothing toasts here unless a
// reducer logged it, and the activity page shows the same record.

// Heartbeats fire every few seconds and system rows describe module
// lifecycle. Neither is worth an interruption.
const SILENT_KINDS = new Set(["heartbeat", "system"]);

const ERROR_KINDS = new Set(["task_rejected", "worker_killed", "worker_reaped", "sla_breached"]);

const SUCCESS_KINDS = new Set(["task_approved", "building_ingested"]);

export function EventToaster() {
  const events = useEvents();

  // Everything already in the table at mount is history, not news. Only rows
  // with a higher id than the baseline toast.
  const baselineId = useRef<bigint | null>(null);
  const announced = useRef<Set<bigint>>(new Set());

  useEffect(() => {
    if (events.length === 0) {
      return;
    }

    const maxId = events.reduce((max, e) => (e.id > max ? e.id : max), BigInt(0));

    if (baselineId.current === null) {
      baselineId.current = maxId;
      return;
    }

    for (const event of events) {
      if (event.id <= baselineId.current) continue;
      if (announced.current.has(event.id)) continue;
      announced.current.add(event.id);

      if (SILENT_KINDS.has(event.kind)) continue;

      const label = event.kind.replace(/_/g, " ");
      if (ERROR_KINDS.has(event.kind)) {
        toast.error(event.payload, { description: label });
      } else if (SUCCESS_KINDS.has(event.kind)) {
        toast.success(event.payload, { description: label });
      } else {
        toast(event.payload, { description: label });
      }
    }

    baselineId.current = maxId;
  }, [events]);

  return null;
}

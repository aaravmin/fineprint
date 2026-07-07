"use client";

import { useEffect, useRef } from "react";

import { toast } from "sonner";

import { tables } from "@/lib/db";
import { useTable } from "@/lib/db/react";
import { ERROR_KINDS, eventLabel, NOISE_KINDS, SUCCESS_KINDS } from "@/lib/events";

// Every reducer writes an event row; this turns the rows that matter into
// toasts. The audit trail is the single source: nothing toasts here unless a
// reducer logged it, and the activity page shows the same record.

// Cap the de-dupe set so a long-lived session can't grow it without bound.
const ANNOUNCED_CAP = 500;

export function EventToaster() {
  const [events] = useTable(tables.event);

  // Everything already in the table at mount is history, not news. Only rows
  // with a higher id than the baseline toast.
  const baselineId = useRef<number | null>(null);
  const announced = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (events.length === 0) {
      return;
    }

    const maxId = events.reduce((max, e) => (e.id > max ? e.id : max), 0);

    if (baselineId.current === null) {
      baselineId.current = maxId;
      return;
    }

    for (const event of events) {
      if (event.id <= baselineId.current) continue;
      if (announced.current.has(event.id)) continue;
      announced.current.add(event.id);

      if (NOISE_KINDS.has(event.kind)) continue;

      const label = eventLabel(event.kind);
      if (ERROR_KINDS.has(event.kind)) {
        toast.error(event.payload, { description: label });
      } else if (SUCCESS_KINDS.has(event.kind)) {
        toast.success(event.payload, { description: label });
      } else {
        toast(event.payload, { description: label });
      }
    }

    // Keep the de-dupe set bounded; baselineId already blocks anything older,
    // so dropping the oldest ids is safe.
    if (announced.current.size > ANNOUNCED_CAP) {
      announced.current = new Set([...announced.current].slice(-ANNOUNCED_CAP));
    }

    baselineId.current = maxId;
  }, [events]);

  return null;
}

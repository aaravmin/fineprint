"use client";

import { useEffect, useId, useState } from "react";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { useSupabaseClient } from "@/components/supabase-provider";
import type { Database } from "@/lib/supabase/types";

type PublicTable = keyof Database["public"]["Tables"];
type RowOf<T extends PublicTable> = Database["public"]["Tables"][T]["Row"];

type ChangePayload = RealtimePostgresChangesPayload<{ [key: string]: unknown }>;

// The Realtime replacement for a SpacetimeDB table subscription. A SpacetimeDB
// subscription delivered a full snapshot then live deltas; Supabase Realtime
// delivers only deltas, so this reconstructs the snapshot without a gap:
//
//   1. subscribe first, and BUFFER any delta that arrives before the snapshot;
//   2. once the channel is SUBSCRIBED, fetch the snapshot (authoritative);
//   3. replay the buffered deltas on top, then apply live deltas directly.
//
// Because the buffer opens before the select is issued, no row committed in the
// gap is lost. The SUBSCRIBED callback also fires on reconnect, so a dropped
// channel re-syncs against the current DB state instead of going silently stale.
// RLS scopes both the snapshot and the change feed to the signed-in account.
//
// Assumes an integer `id` primary key (true for every table here except
// `settings`, which is keyed by owner and needs its own hook).
export function useRealtimeTable<T extends PublicTable>(table: T): { rows: RowOf<T>[]; ready: boolean } {
  const supabase = useSupabaseClient();
  // A per-instance channel name: the same table can be watched by two hooks on
  // one page (e.g. useTasks and useWorkers both read tasks), and a shared
  // channel name makes the second .on() throw "after subscribe()".
  const channelId = useId();
  const [rows, setRows] = useState<RowOf<T>[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const byId = new Map<number, RowOf<T>>();
    let snapshotApplied = false;
    let buffered: ChangePayload[] = [];

    const publish = () => {
      if (active) {
        setRows([...byId.values()]);
      }
    };

    const apply = (payload: ChangePayload) => {
      if (payload.eventType === "DELETE") {
        byId.delete((payload.old as { id?: number }).id as number);
      } else {
        const row = payload.new as unknown as RowOf<T> & { id: number };
        byId.set(row.id, row);
      }
    };

    const channel = supabase
      .channel(`realtime:${table}:${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: table as string }, (payload) => {
        if (!active) {
          return;
        }
        if (!snapshotApplied) {
          buffered.push(payload);
          return;
        }
        apply(payload);
        publish();
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") {
          return;
        }
        // Reopen the buffer, then take a fresh authoritative snapshot. Runs on
        // first connect and again on every reconnect.
        snapshotApplied = false;
        buffered = [];

        void supabase
          .from(table)
          .select("*")
          .then(({ data }) => {
            if (!active || !data) {
              return;
            }
            byId.clear();
            for (const row of data as unknown as (RowOf<T> & { id: number })[]) {
              byId.set(row.id, row);
            }
            for (const payload of buffered) {
              apply(payload);
            }
            buffered = [];
            snapshotApplied = true;
            publish();
            setReady(true);
          });
      });

    return () => {
      active = false;
      snapshotApplied = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, table, channelId]);

  return { rows, ready };
}

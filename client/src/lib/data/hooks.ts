"use client";

import { useMemo } from "react";

import type {
  BinderEvent,
  Building,
  BuildingDocument,
  Evidence,
  Obligation,
  Settings,
  Event as StdbEvent,
  Submission,
  Task,
  Vendor,
  Worker,
} from "@/lib/data/types";

import {
  mapBinderEvent,
  mapBuilding,
  mapBuildingDocument,
  mapEvent,
  mapEvidence,
  mapObligation,
  mapSettings,
  mapSubmission,
  mapTask,
  mapVendor,
  syntheticWorkers,
} from "./shape";
import { useRealtimeTable } from "./useRealtimeTable";

// The dashboard's read hooks. Each subscribes to a Supabase table via Realtime
// and maps rows into the shared row shapes (lib/data/types). One place owns the
// table -> shape mapping; components read these and are backend-unaware.

export function useTasks(): readonly Task[] {
  const { rows } = useRealtimeTable("tasks");
  return useMemo(() => rows.map(mapTask), [rows]);
}

export function useBuildings(): readonly Building[] {
  const { rows } = useRealtimeTable("buildings");
  return useMemo(() => rows.map(mapBuilding), [rows]);
}

export function useSubmissions(): readonly Submission[] {
  const { rows } = useRealtimeTable("submissions");
  return useMemo(() => rows.map(mapSubmission), [rows]);
}

export function useSettingsRows(): readonly Settings[] {
  const { rows } = useRealtimeTable("settings");
  return useMemo(() => rows.map(mapSettings), [rows]);
}

export function useEvents(): readonly StdbEvent[] {
  const { rows } = useRealtimeTable("events");
  return useMemo(() => rows.map(mapEvent), [rows]);
}

export function useVendors(): readonly Vendor[] {
  const { rows } = useRealtimeTable("vendors");
  return useMemo(() => rows.map(mapVendor), [rows]);
}

export function useObligations(): readonly Obligation[] {
  const { rows } = useRealtimeTable("obligations");
  return useMemo(() => rows.map(mapObligation), [rows]);
}

export function useEvidence(): readonly Evidence[] {
  const { rows } = useRealtimeTable("evidence");
  return useMemo(() => rows.map(mapEvidence), [rows]);
}

export function useBinderEvents(): readonly BinderEvent[] {
  const { rows } = useRealtimeTable("binder_events");
  return useMemo(() => rows.map(mapBinderEvent), [rows]);
}

export function useBuildingDocuments(): readonly BuildingDocument[] {
  const { rows } = useRealtimeTable("building_documents");
  return useMemo(() => rows.map(mapBuildingDocument), [rows]);
}

// No persistent worker fleet under Trigger.dev — synthesize one agent per task
// currently running.
export function useWorkers(): readonly Worker[] {
  const tasks = useTasks();
  return useMemo(() => syntheticWorkers(tasks), [tasks]);
}

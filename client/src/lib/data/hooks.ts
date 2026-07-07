"use client";

import { useMemo } from "react";

import { TRACKED_CATEGORIES } from "@/lib/categories/trackedCategories";
import type {
  BinderEvent,
  Building,
  BuildingDocument,
  CategoryPref,
  Evidence,
  Obligation,
  Settings,
  Event as StdbEvent,
  Submission,
  SystemDeadline,
  Task,
  UserRecord,
  Vendor,
  Worker,
} from "@/lib/data/types";

import {
  mapBinderEvent,
  mapBuilding,
  mapBuildingDocument,
  mapCategoryPref,
  mapEvent,
  mapEvidence,
  mapObligation,
  mapSettings,
  mapSubmission,
  mapSystemDeadline,
  mapTask,
  mapUserRecord,
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

export function useSystemDeadlines(): readonly SystemDeadline[] {
  const { rows } = useRealtimeTable("system_deadlines");
  return useMemo(() => rows.map(mapSystemDeadline), [rows]);
}

export function useUserRecords(): readonly UserRecord[] {
  const { rows } = useRealtimeTable("user_records");
  return useMemo(() => rows.map(mapUserRecord), [rows]);
}

export function useCategoryPrefs(): readonly CategoryPref[] {
  const { rows } = useRealtimeTable("category_preferences");
  return useMemo(() => rows.map(mapCategoryPref), [rows]);
}

// The tracked-category set under an opt-out model: a category is tracked unless
// the owner has a preference row explicitly disabling it, and "compliance" is
// always tracked. `tracked` covers only the trackable categories (compliance
// plus the enabled retrofit categories); `isTracked` answers for any id.
export function useTrackedCategories(): {
  isTracked(id: string): boolean;
  tracked: Set<string>;
  prefs: readonly CategoryPref[];
} {
  const prefs = useCategoryPrefs();

  return useMemo(() => {
    const disabledByPref = new Set(prefs.filter((pref) => !pref.enabled).map((pref) => pref.category));

    const isTracked = (id: string): boolean => {
      if (id === "compliance") {
        return true;
      }
      return !disabledByPref.has(id);
    };

    const tracked = new Set(
      TRACKED_CATEGORIES.filter((category) => isTracked(category.id)).map((category) => category.id),
    );

    return { isTracked, tracked, prefs };
  }, [prefs]);
}

// No persistent worker fleet under Trigger.dev — synthesize one agent per task
// currently running.
export function useWorkers(): readonly Worker[] {
  const tasks = useTasks();
  return useMemo(() => syntheticWorkers(tasks), [tasks]);
}

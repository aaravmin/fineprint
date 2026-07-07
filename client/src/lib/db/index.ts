// The dashboard's database vocabulary: table descriptors for useTable and
// call descriptors for useReducer. Names and call signatures match what the
// components used against the old backend, so a page reads and writes the
// same way — the descriptors carry the snake_case translation.

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Approval,
  BinderEvent,
  Building,
  Event,
  Evidence,
  Obligation,
  Settings,
  Submission,
  Task,
  Vendor,
  Worker,
} from "./types";

export interface TableToken<T> {
  name: TableName;
  // Phantom field so TableToken<Building> and TableToken<Task> don't unify.
  row?: T;
}

export type TableName =
  | "building"
  | "task"
  | "worker"
  | "submission"
  | "approval"
  | "settings"
  | "event"
  | "vendor"
  | "obligation"
  | "evidence"
  | "binder_event";

export const TABLE_NAMES: TableName[] = [
  "building",
  "task",
  "worker",
  "submission",
  "approval",
  "settings",
  "event",
  "vendor",
  "obligation",
  "evidence",
  "binder_event",
];

export const tables = {
  building: { name: "building" } as TableToken<Building>,
  task: { name: "task" } as TableToken<Task>,
  worker: { name: "worker" } as TableToken<Worker>,
  submission: { name: "submission" } as TableToken<Submission>,
  approval: { name: "approval" } as TableToken<Approval>,
  settings: { name: "settings" } as TableToken<Settings>,
  event: { name: "event" } as TableToken<Event>,
  vendor: { name: "vendor" } as TableToken<Vendor>,
  obligation: { name: "obligation" } as TableToken<Obligation>,
  evidence: { name: "evidence" } as TableToken<Evidence>,
  binderEvent: { name: "binder_event" } as TableToken<BinderEvent>,
};

// A reducer descriptor: the RPC to call and how the component's argument
// object maps onto the function's parameters.
export interface ReducerToken<Args> {
  rpc: string;
  toParams: (args: Args, db: SupabaseClient) => Promise<Record<string, unknown>>;
}

function direct<Args>(rpc: string, map: (args: Args) => Record<string, unknown>): ReducerToken<Args> {
  return { rpc, toParams: async (args) => map(args) };
}

export const reducers = {
  requestBuilding: direct("request_building", (a: { address: string }) => ({
    p_address: a.address,
  })),
  approve: direct("approve", (a: { taskId: number; note: string }) => ({
    p_task_id: a.taskId,
    p_note: a.note,
  })),
  reject: direct("reject", (a: { taskId: number; note: string }) => ({
    p_task_id: a.taskId,
    p_note: a.note,
  })),
  markDone: direct("mark_done", (a: { taskId: number; note: string }) => ({
    p_task_id: a.taskId,
    p_note: a.note,
  })),
  setReviewMode: direct("set_review_mode", (a: { mode: string }) => ({
    p_mode: a.mode,
  })),
  killWorker: direct("kill_worker", (a: { workerId: number }) => ({
    p_worker_id: a.workerId,
  })),
  pruneDeadWorkers: direct("prune_dead_workers", (_a: Record<string, never>) => ({})),
  setObligationStatus: direct("set_obligation_status", (a: { obligationId: number; status: string }) => ({
    p_obligation_id: a.obligationId,
    p_status: a.status,
  })),
  assignVendor: direct("assign_vendor", (a: { obligationId: number; vendorId: number }) => ({
    p_obligation_id: a.obligationId,
    p_vendor_id: a.vendorId,
  })),
  addVendor: direct(
    "add_vendor",
    (a: {
      name: string;
      company: string;
      roleType: string;
      email: string;
      phone: string;
      licenseNumber: string;
      licenseType: string;
      notes: string;
    }) => ({
      p_name: a.name,
      p_company: a.company,
      p_role_type: a.roleType,
      p_email: a.email,
      p_phone: a.phone,
      p_license_number: a.licenseNumber,
      p_license_type: a.licenseType,
      p_notes: a.notes,
    }),
  ),
  addEvidence: direct(
    "add_evidence",
    (a: {
      obligationId: number;
      fileName: string;
      fileType: string;
      fileUrlOrKey: string;
      uploadedBy: string;
      issuer: string;
      filingReferenceNumber: string;
      notes: string;
    }) => ({
      p_obligation_id: a.obligationId,
      p_file_name: a.fileName,
      p_file_type: a.fileType,
      p_file_url_or_key: a.fileUrlOrKey,
      p_uploaded_by: a.uploadedBy,
      p_issuer: a.issuer,
      p_filing_reference_number: a.filingReferenceNumber,
      p_notes: a.notes,
    }),
  ),
  // The obligation specs come from the law registry, which lives outside the
  // database (same boundary the old backend had). Compute them from the
  // building row at call time and hand the RPC a validated list.
  seedObligations: {
    rpc: "seed_obligations",
    toParams: async (a: { buildingId: number }, db: SupabaseClient) => {
      const { applicableLaws } = await import("fineprint-laws");
      const { data, error } = await db.from("building").select("*").eq("id", a.buildingId).maybeSingle();
      if (error || !data) {
        throw new Error(`no building with id ${a.buildingId}`);
      }

      const asOf = new Date();
      const specs = applicableLaws({
        sqft: data.sqft,
        isAffordable: data.is_affordable,
        bbl: data.bbl ?? undefined,
        numFloors: data.num_floors ?? undefined,
        unitsResidential: data.units_residential ?? undefined,
        communityDistrict: data.community_district ?? undefined,
        energyStarScore: data.energy_star_score ?? undefined,
      }).map((law) => ({
        law_id: law.id,
        title: law.name,
        due_date: law
          .nextDeadline(asOf, {
            sqft: data.sqft,
            isAffordable: data.is_affordable,
            bbl: data.bbl ?? undefined,
            numFloors: data.num_floors ?? undefined,
            unitsResidential: data.units_residential ?? undefined,
            communityDistrict: data.community_district ?? undefined,
            energyStarScore: data.energy_star_score ?? undefined,
          })
          ?.toISOString(),
      }));

      return { p_building_id: a.buildingId, p_specs: specs };
    },
  } as ReducerToken<{ buildingId: number }>,
};

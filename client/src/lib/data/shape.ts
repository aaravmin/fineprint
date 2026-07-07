// Maps Supabase rows (snake_case, number ids, ISO-string timestamps, jsonb) into
// the exact SpacetimeDB row shapes the dashboard components already consume
// (camelCase, bigint ids, a Timestamp-like `{ toDate() }`, JSON *strings*, and
// `undefined` for absent options). Casting to the module_bindings types keeps
// every component's existing type annotations valid; at runtime the objects
// expose only what those components actually touch (chiefly `.toDate()` on
// timestamps and bigint ids). Deleted alongside the SpacetimeDB path in Phase 4.

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
import type { Database } from "@/lib/supabase/types";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

// A minimal stand-in for SpacetimeDB's Timestamp — components only ever call
// .toDate() (sometimes chained to .getTime()/.toISOString()/.toLocaleDateString()).
function ts(iso: string): { toDate: () => Date } {
  return { toDate: () => new Date(iso) };
}

function tsOpt(iso: string | null): { toDate: () => Date } | undefined {
  return iso ? ts(iso) : undefined;
}

// jsonb column -> the JSON *string* the components expect to JSON.parse.
function jsonStr(value: unknown): string | undefined {
  return value == null ? undefined : JSON.stringify(value);
}

function opt<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

export function mapTask(row: Row<"tasks">): Task {
  return {
    id: BigInt(row.id),
    owner: row.owner,
    fleetScope: 0,
    buildingId: BigInt(row.building_id ?? 0),
    lawId: row.law_id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    category: row.category ?? "compliance",
    deadline: ts(row.deadline),
    slaBreached: row.sla_breached,
    fineEstimateUsd: opt(row.fine_estimate_usd),
    // No worker lease in the new model — the "claimed by" column reads blank.
    claimedBy: undefined,
    intakeAddress: opt(row.intake_address),
    createdAt: ts(row.created_at),
  } as unknown as Task;
}

export function mapBuilding(row: Row<"buildings">): Building {
  return {
    id: BigInt(row.id),
    owner: row.owner,
    fleetScope: 0,
    address: row.address,
    bbl: opt(row.bbl),
    bin: opt(row.bin),
    sqft: row.sqft,
    isAffordable: row.is_affordable,
    // Codegen capitalizes the trailing e — components read annualEmissionsTco2E.
    annualEmissionsTco2E: opt(row.annual_emissions_tco2e),
    usesJson: jsonStr(row.uses_json),
    // Tri-state: null must stay undefined, never coerce to false.
    ll97Covered: opt(row.ll97_covered),
    provenanceJson: jsonStr(row.provenance_json),
    numFloors: opt(row.num_floors),
    unitsResidential: opt(row.units_residential),
    communityDistrict: opt(row.community_district),
    energyStarScore: opt(row.energy_star_score),
    compliancePlanJson: jsonStr(row.compliance_plan_json),
    // Supabase has no systems column yet; the systems panel renders empty.
    systemsJson: undefined,
    createdAt: ts(row.created_at),
  } as unknown as Building;
}

export function mapSubmission(row: Row<"submissions">): Submission {
  return {
    id: BigInt(row.id),
    owner: row.owner,
    fleetScope: 0,
    taskId: BigInt(row.task_id),
    workerId: BigInt(0),
    body: row.body,
    payloadJson: jsonStr(row.payload_json),
    submittedAt: ts(row.submitted_at),
  } as unknown as Submission;
}

export function mapSettings(row: Row<"settings">): Settings {
  return {
    owner: row.owner,
    reviewMode: row.review_mode,
    primaryAddress: opt(row.primary_address),
  } as unknown as Settings;
}

export function mapEvent(row: Row<"events">): StdbEvent {
  return {
    id: BigInt(row.id),
    owner: row.owner,
    kind: row.kind,
    taskId: row.task_id == null ? undefined : BigInt(row.task_id),
    workerId: undefined,
    payload: row.payload,
    at: ts(row.at),
  } as unknown as StdbEvent;
}

export function mapVendor(row: Row<"vendors">): Vendor {
  return {
    id: BigInt(row.id),
    owner: row.owner,
    fleetScope: 0,
    name: row.name,
    company: row.company,
    roleType: row.role_type,
    email: row.email,
    phone: row.phone,
    licenseNumber: row.license_number,
    licenseType: row.license_type,
    notes: row.notes,
    createdAt: ts(row.created_at),
  } as unknown as Vendor;
}

export function mapObligation(row: Row<"obligations">): Obligation {
  return {
    id: BigInt(row.id),
    owner: row.owner,
    fleetScope: 0,
    buildingId: BigInt(row.building_id),
    lawId: row.law_id,
    title: row.title,
    status: row.status,
    dueDate: tsOpt(row.due_date),
    responsibleParty: row.responsible_party,
    vendorId: row.vendor_id == null ? undefined : BigInt(row.vendor_id),
    filingReferenceNumber: row.filing_reference_number,
    notes: row.notes,
    createdAt: ts(row.created_at),
    updatedAt: ts(row.updated_at),
    completedAt: tsOpt(row.completed_at),
  } as unknown as Obligation;
}

export function mapEvidence(row: Row<"evidence">): Evidence {
  return {
    id: BigInt(row.id),
    owner: row.owner,
    fleetScope: 0,
    obligationId: BigInt(row.obligation_id),
    buildingId: BigInt(row.building_id),
    lawId: row.law_id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileUrlOrKey: row.storage_path,
    uploadedBy: row.uploaded_by,
    uploadedAt: ts(row.uploaded_at),
    documentDate: tsOpt(row.document_date),
    expirationDate: tsOpt(row.expiration_date),
    issuer: row.issuer,
    vendorId: row.vendor_id == null ? undefined : BigInt(row.vendor_id),
    filingReferenceNumber: row.filing_reference_number,
    verificationStatus: row.verification_status,
    notes: row.notes,
  } as unknown as Evidence;
}

// Unlike the legacy shapes above, this returns a real typed object, so no
// `as unknown as` cast is needed.
export function mapBuildingDocument(row: Row<"building_documents">): BuildingDocument {
  return {
    id: BigInt(row.id),
    owner: row.owner,
    buildingId: BigInt(row.building_id),
    storagePath: row.storage_path,
    fileName: row.file_name,
    docType: row.doc_type,
    documentDate: row.document_date,
    referenceNumber: row.reference_number,
    note: row.note,
    uploadedAt: ts(row.uploaded_at),
  };
}

export function mapSystemDeadline(row: Row<"system_deadlines">): SystemDeadline {
  return {
    id: BigInt(row.id),
    buildingId: BigInt(row.building_id),
    systemKey: row.system_key,
    kind: row.kind,
    title: row.title,
    dueDate: ts(row.due_date),
    actByDate: ts(row.act_by_date),
    basis: row.basis,
    sourceDataset: row.source_dataset,
    sourceRecordId: row.source_record_id,
    status: row.status,
  };
}

export function mapUserRecord(row: Row<"user_records">): UserRecord {
  return {
    id: BigInt(row.id),
    buildingId: BigInt(row.building_id),
    systemKey: opt(row.system_key),
    recordType: row.record_type,
    fileName: row.file_name,
    fileType: row.file_type,
    storagePath: row.storage_path,
    notes: row.notes,
    uploadedAt: ts(row.uploaded_at),
  };
}

export function mapCategoryPref(row: Row<"category_preferences">): CategoryPref {
  return {
    id: BigInt(row.id),
    category: row.category,
    enabled: row.enabled,
  };
}

export function mapBinderEvent(row: Row<"binder_events">): BinderEvent {
  return {
    id: BigInt(row.id),
    owner: row.owner,
    fleetScope: 0,
    buildingId: BigInt(row.building_id),
    obligationId: row.obligation_id == null ? undefined : BigInt(row.obligation_id),
    lawId: row.law_id,
    kind: row.kind,
    summary: row.summary,
    at: ts(row.at),
  } as unknown as BinderEvent;
}

// There is no persistent worker fleet under Trigger.dev, so the "agents" views
// show the ephemeral truth: one synthetic agent per task currently running.
// Empty when nothing is in flight — an honest "no agents online".
const KIND_SHORT: Record<string, string> = {
  building_intake: "intake",
  emissions_fine_analysis: "ll97",
  prescriptive_measures_plan: "art321",
};

export function syntheticWorkers(tasks: readonly Task[]): Worker[] {
  return tasks
    .filter((task) => task.status === "running")
    .map(
      (task) =>
        ({
          id: task.id,
          identity: undefined,
          fleetScope: 0,
          name: `${KIND_SHORT[task.kind] ?? task.kind}-${task.id}`,
          status: "working",
          lastHeartbeat: { toDate: () => new Date() },
          currentTaskId: task.id,
        }) as unknown as Worker,
    );
}

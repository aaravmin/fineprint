"use client";

import { useAuth } from "@clerk/nextjs";

import { useSupabaseClient } from "@/components/supabase-provider";
import type { Json } from "@/lib/supabase/types";

// The dashboard's mutation hooks. Each returns a function with the signature the
// components call, resolving on success / rejecting on failure so the existing
// withAck(...) wrappers keep working. Core task transitions go through the
// service-role routes under client/src/app/api; the owner-owned binder tables
// are written directly through the RLS browser client.

async function postJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `request failed (${response.status})`);
  }
}

export function useRequestBuildingCall() {
  return ({ address }: { address: string }) => postJson("/api/tasks", { address });
}

export function useApprove() {
  return ({ taskId, note }: { taskId: bigint; note: string }) => postJson(`/api/tasks/${taskId}/approve`, { note });
}

export function useReject() {
  return ({ taskId, note }: { taskId: bigint; note: string }) => postJson(`/api/tasks/${taskId}/reject`, { note });
}

export function useMarkDone() {
  return ({ taskId, note }: { taskId: bigint; note: string }) => postJson(`/api/tasks/${taskId}/done`, { note });
}

export function useSetReviewMode() {
  return ({ mode }: { mode: string }) => postJson("/api/settings", { reviewMode: mode });
}

// No persistent fleet on Supabase; the old kill/prune buttons no-op.
export function useKillWorker() {
  return async (_args: { workerId: bigint }) => {};
}

export function usePruneDeadWorkers() {
  return async () => {};
}

export function useSeedObligations() {
  return ({ buildingId }: { buildingId: bigint }) => postJson(`/api/buildings/${buildingId}/seed-obligations`, {});
}

// --- compliance binder (owner-owned tables, written directly under RLS) ------

export function useAddVendor() {
  const supabase = useSupabaseClient();
  const { userId } = useAuth();
  return async (args: {
    name: string;
    company: string;
    roleType: string;
    email: string;
    phone: string;
    licenseNumber: string;
    licenseType: string;
    notes: string;
  }) => {
    const { error } = await supabase.from("vendors").insert({
      owner: userId ?? "",
      name: args.name,
      company: args.company,
      role_type: args.roleType,
      email: args.email,
      phone: args.phone,
      license_number: args.licenseNumber,
      license_type: args.licenseType,
      notes: args.notes,
    });
    if (error) throw new Error(error.message);
  };
}

export function useAssignVendor() {
  const supabase = useSupabaseClient();
  const { userId } = useAuth();
  return async ({ obligationId, vendorId }: { obligationId: bigint; vendorId: bigint }) => {
    const { data: obligation, error: readError } = await supabase
      .from("obligations")
      .select("building_id, law_id")
      .eq("id", Number(obligationId))
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const { error } = await supabase
      .from("obligations")
      .update({ vendor_id: Number(vendorId), updated_at: new Date().toISOString() })
      .eq("id", Number(obligationId));
    if (error) throw new Error(error.message);

    if (obligation) {
      await supabase.from("binder_events").insert({
        owner: userId ?? "",
        building_id: obligation.building_id,
        obligation_id: Number(obligationId),
        law_id: obligation.law_id,
        kind: "vendor_assigned",
        summary: "Vendor assigned",
      });
    }
  };
}

export function useSetObligationStatus() {
  const supabase = useSupabaseClient();
  const { userId } = useAuth();
  return async ({ obligationId, status }: { obligationId: bigint; status: string }) => {
    const { data: obligation, error: readError } = await supabase
      .from("obligations")
      .select("building_id, law_id")
      .eq("id", Number(obligationId))
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const { error } = await supabase
      .from("obligations")
      .update({
        status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", Number(obligationId));
    if (error) throw new Error(error.message);

    if (obligation) {
      await supabase.from("binder_events").insert({
        owner: userId ?? "",
        building_id: obligation.building_id,
        obligation_id: Number(obligationId),
        law_id: obligation.law_id,
        kind: "status_changed",
        summary: `Status set to ${status.replace(/_/g, " ")}`,
      });
    }
  };
}

export function useAddEvidence() {
  const supabase = useSupabaseClient();
  const { userId } = useAuth();
  return async (args: {
    obligationId: bigint;
    fileName: string;
    fileType: string;
    fileUrlOrKey: string;
    uploadedBy: string;
    issuer: string;
    filingReferenceNumber: string;
    notes: string;
  }) => {
    const { data: obligation, error: readError } = await supabase
      .from("obligations")
      .select("building_id, law_id, vendor_id")
      .eq("id", Number(args.obligationId))
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!obligation) throw new Error("no such obligation");

    const { error } = await supabase.from("evidence").insert({
      owner: userId ?? "",
      obligation_id: Number(args.obligationId),
      building_id: obligation.building_id,
      law_id: obligation.law_id,
      file_name: args.fileName,
      file_type: args.fileType,
      storage_path: args.fileUrlOrKey,
      uploaded_by: args.uploadedBy,
      issuer: args.issuer,
      vendor_id: obligation.vendor_id,
      filing_reference_number: args.filingReferenceNumber,
      notes: args.notes,
    });
    if (error) throw new Error(error.message);

    await supabase.from("binder_events").insert({
      owner: userId ?? "",
      building_id: obligation.building_id,
      obligation_id: Number(args.obligationId),
      law_id: obligation.law_id,
      kind: "evidence_uploaded",
      summary: `Proof filed: ${args.fileName}`,
    });
  };
}

// --- Building documents (the standardized upload library) ---------------------

// Uploads an owner's document into the private evidence bucket under the account's
// own `<owner>/documents/...` prefix (the storage RLS policies key on the first
// path segment), then records one building_documents row with the cover-sheet
// metadata the owner supplied. The file is never parsed.
export function useUploadBuildingDocument() {
  const supabase = useSupabaseClient();
  const { userId } = useAuth();
  return async ({
    buildingId,
    file,
    docType,
    documentDate,
    referenceNumber,
    note,
  }: {
    buildingId: bigint;
    file: File;
    docType: string;
    documentDate?: string | null;
    referenceNumber?: string;
    note?: string;
  }) => {
    // A first-line size cap so a stray large file fails fast with a clear message.
    // The authoritative limit is the evidence bucket's server-side file_size_limit.
    const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error("File is larger than 25 MB. Upload a smaller PDF or image.");
    }

    const owner = userId ?? "";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const storagePath = `${owner}/documents/${Number(buildingId)}/${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabase.storage.from("evidence").upload(storagePath, file, { upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { error } = await supabase.from("building_documents").insert({
      owner,
      building_id: Number(buildingId),
      storage_path: storagePath,
      file_name: file.name,
      doc_type: docType,
      document_date: documentDate ?? null,
      reference_number: referenceNumber ?? "",
      note: note ?? "",
    });
    if (error) throw new Error(error.message);
  };
}

// Removes a document from the library and its underlying file.
export function useDeleteBuildingDocument() {
  const supabase = useSupabaseClient();
  return async ({ id, storagePath }: { id: bigint; storagePath: string }) => {
    const { error } = await supabase.from("building_documents").delete().eq("id", Number(id));
    if (error) throw new Error(error.message);
    await supabase.storage.from("evidence").remove([storagePath]);
  };
}

// --- Tracked categories, owner records, and system overrides ------------------

// Opts a category in or out for the account. The tracked set is opt-out, so a
// row here only exists once the owner has changed a category away from its
// default; the unique (owner, category) key makes repeat toggles an upsert.
export function useToggleCategory() {
  const supabase = useSupabaseClient();
  const { userId } = useAuth();
  return async (category: string, enabled: boolean) => {
    const { error } = await supabase
      .from("category_preferences")
      .upsert({ owner: userId ?? "", category, enabled }, { onConflict: "owner,category" });
    if (error) throw new Error(error.message);
  };
}

// Uploads an owner file into the private evidence bucket under the account's own
// `<owner>/records/...` prefix (the storage RLS policies key on the first path
// segment), then records one user_records row. The file is never parsed.
export function useAddUserRecord() {
  const supabase = useSupabaseClient();
  const { userId } = useAuth();
  return async ({
    buildingId,
    systemKey,
    recordType,
    file,
    notes,
  }: {
    buildingId: bigint;
    systemKey?: string;
    recordType: string;
    file: File;
    notes?: string;
  }) => {
    // A first-line size cap so a stray large file fails fast with a clear message.
    // The authoritative limit is the evidence bucket's server-side file_size_limit.
    const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error("File is larger than 25 MB. Upload a smaller PDF or image.");
    }

    const owner = userId ?? "";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const storagePath = `${owner}/records/${Number(buildingId)}/${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabase.storage.from("evidence").upload(storagePath, file, { upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { error } = await supabase.from("user_records").insert({
      owner,
      building_id: Number(buildingId),
      system_key: systemKey ?? null,
      record_type: recordType,
      file_name: file.name,
      file_type: file.type,
      storage_path: storagePath,
      notes: notes ?? "",
      uploaded_by: owner,
    });
    if (error) throw new Error(error.message);
  };
}

// Records the owner's correction to one system field in the building_overrides
// jsonb, merging into the existing per-building document rather than replacing
// it, then asks the server to recompute the model against the new value.
export function useSetSystemOverride() {
  const supabase = useSupabaseClient();
  const { userId } = useAuth();
  return async ({
    buildingId,
    systemKey,
    field,
    value,
    recordId,
  }: {
    buildingId: bigint;
    systemKey: string;
    field: string;
    value: unknown;
    recordId?: bigint;
  }) => {
    const owner = userId ?? "";

    const { data: existing, error: readError } = await supabase
      .from("building_overrides")
      .select("data")
      .eq("building_id", Number(buildingId))
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const merged = (existing?.data ?? {}) as Record<string, Record<string, unknown>>;
    const forSystem = { ...(merged[systemKey] ?? {}) };
    forSystem[field] = {
      value,
      recordId: recordId == null ? undefined : Number(recordId),
      enteredAt: new Date().toISOString(),
    };
    merged[systemKey] = forSystem;

    const { error } = await supabase.from("building_overrides").upsert(
      {
        building_id: Number(buildingId),
        owner,
        data: merged as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "building_id" },
    );
    if (error) throw new Error(error.message);

    await postJson(`/api/buildings/${Number(buildingId)}/recompute`, {});
  };
}

export function useStartOnboarding() {
  return (address: string) => postJson("/api/onboarding", { address });
}

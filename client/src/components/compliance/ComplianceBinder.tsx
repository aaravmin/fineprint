"use client";

import { useState } from "react";

import { Download, FileCheck2, FolderOpen, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  type BinderEvidence,
  type BinderHistoryEvent,
  type BinderObligation,
  type BinderVendor,
  buildBinderExport,
  obligationCoverage,
} from "@/lib/compliance/binder";
import { reducers, tables } from "@/lib/db";
import { useReducer, useTable } from "@/lib/db/react";
import type { Building, Evidence, Obligation, Vendor } from "@/lib/db/types";
import { lawById } from "@/lib/laws/lawRegistry";
import { withAck } from "@/lib/reducer-call";

const OBLIGATION_STATUSES = [
  "not_started",
  "in_progress",
  "submitted",
  "filed",
  "completed",
  "overdue",
  "blocked",
  "not_applicable",
  "missing_data",
];
const VENDOR_ROLES = [
  "QEWI",
  "LMP",
  "energy_auditor",
  "retro_commissioning_agent",
  "contractor",
  "engineer",
  "architect",
  "expeditor",
  "property_manager",
  "elevator_vendor",
  "sprinkler_vendor",
  "general_vendor",
  "other",
];

const iso = (ts: Date | undefined): string | null => (ts ? ts.toISOString() : null);

// Map live binding rows to the binder's plain shapes (used for both the UI and
// the JSON export, so the screen and the file never disagree).
const toObligation = (o: Obligation): BinderObligation => ({
  id: o.id.toString(),
  lawId: o.lawId,
  title: o.title,
  status: o.status,
  dueDate: iso(o.dueDate),
  responsibleParty: o.responsibleParty,
  vendorId: o.vendorId !== undefined ? o.vendorId.toString() : null,
  filingReferenceNumber: o.filingReferenceNumber,
  notes: o.notes,
  completedAt: iso(o.completedAt),
});
const toEvidence = (e: Evidence): BinderEvidence => ({
  id: e.id.toString(),
  obligationId: e.obligationId.toString(),
  lawId: e.lawId,
  fileName: e.fileName,
  fileType: e.fileType,
  issuer: e.issuer,
  documentDate: iso(e.documentDate),
  filingReferenceNumber: e.filingReferenceNumber,
  verificationStatus: e.verificationStatus,
});
const toVendor = (v: Vendor): BinderVendor => ({
  id: v.id.toString(),
  name: v.name,
  company: v.company,
  roleType: v.roleType,
  email: v.email,
  phone: v.phone,
  licenseNumber: v.licenseNumber,
  licenseType: v.licenseType,
});

const STATUS_TONE: Record<string, string> = {
  completed: "text-success",
  filed: "text-success",
  not_applicable: "text-muted-foreground",
  missing_data: "text-amber-500",
  blocked: "text-destructive",
  overdue: "text-destructive",
};

export function ComplianceBinder({ building }: { building: Building }) {
  const [obligationRows] = useTable(tables.obligation);
  const [evidenceRows] = useTable(tables.evidence);
  const [vendorRows] = useTable(tables.vendor);
  const [historyRows] = useTable(tables.binderEvent);

  const seedObligations = useReducer(reducers.seedObligations);
  const setStatus = useReducer(reducers.setObligationStatus);
  const assignVendor = useReducer(reducers.assignVendor);
  const addEvidence = useReducer(reducers.addEvidence);
  const addVendor = useReducer(reducers.addVendor);

  const [showVendorForm, setShowVendorForm] = useState(false);

  const obligations = obligationRows.filter((o) => o.buildingId === building.id);
  const evidence = evidenceRows.filter((e) => e.buildingId === building.id);
  const vendors = [...vendorRows];
  const history = historyRows.filter((h) => h.buildingId === building.id).sort((a, b) => (a.at > b.at ? -1 : 1));

  const exportInputs = {
    building: {
      id: building.id.toString(),
      address: building.address,
      bbl: building.bbl ?? null,
      bin: building.bin ?? null,
      sqft: building.sqft,
      buildingType: null,
      yearBuilt: null,
      primaryUse: null,
    },
    obligations: obligations.map(toObligation),
    evidence: evidence.map(toEvidence),
    vendors: vendors.map(toVendor),
    history: history.map(
      (h): BinderHistoryEvent => ({
        kind: h.kind,
        summary: h.summary,
        lawId: h.lawId,
        at: h.at.toISOString(),
      }),
    ),
  };

  const downloadBinder = () => {
    const json = JSON.stringify(buildBinderExport(exportInputs), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `compliance_binder_${building.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Compliance binder exported");
  };

  // Success side-effects belong in onSuccess so they only fire when the RPC
  // actually resolved — a swallowed rejection must never let a "saved" toast
  // run after a "failed" one.
  const call = (promise: Promise<void>, label: string, onSuccess?: () => void) =>
    withAck(promise, label)
      .then(() => onSuccess?.())
      .catch((error: Error) => toast.error(`${label} failed: ${error.message}`));

  if (obligations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="size-4" /> Compliance binder
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Open an obligation for every law that binds this building, then file proof, assign vendors, and export a
            defensible record.
          </p>
        </CardHeader>
        <CardContent>
          <Button
            size="sm"
            onClick={() =>
              call(seedObligations({ buildingId: building.id }), "Setting up the binder", () =>
                toast.success("Binder set up"),
              )
            }
          >
            <Plus className="mr-1 size-3.5" /> Set up compliance binder
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="size-4" /> Compliance binder
          </CardTitle>
          <Button size="sm" variant="outline" onClick={downloadBinder}>
            <Download className="mr-1 size-3.5" /> Export binder
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          One obligation per applicable law. File proof, assign the responsible vendor, and track completion — missing
          required proof is shown, not hidden.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2.5">
          {obligations
            .slice()
            .sort((a, b) => (lawById(a.lawId)?.sort_order ?? 99) - (lawById(b.lawId)?.sort_order ?? 99))
            .map((obligation) => {
              const law = lawById(obligation.lawId);
              const own = evidence.filter((e) => e.obligationId === obligation.id).map(toEvidence);
              const coverage = obligationCoverage(obligation.lawId, own);
              const vendor = obligation.vendorId ? vendors.find((v) => v.id === obligation.vendorId) : undefined;

              return (
                <ObligationRow
                  key={obligation.id.toString()}
                  shortName={law?.short_name ?? obligation.lawId}
                  title={law?.display_name ?? obligation.title}
                  status={obligation.status}
                  dueDate={obligation.dueDate ?? null}
                  vendorLabel={vendor ? `${vendor.name} · ${vendor.roleType.replace(/_/g, " ")}` : null}
                  evidenceCount={own.length}
                  missingRequired={coverage.missingRequired}
                  vendors={vendors}
                  onStatus={(status) => call(setStatus({ obligationId: obligation.id, status }), "Updating status")}
                  onAssign={(vendorId) =>
                    call(assignVendor({ obligationId: obligation.id, vendorId }), "Assigning vendor")
                  }
                  onAddProof={(fileName, issuer, onFiled) =>
                    call(
                      addEvidence({
                        obligationId: obligation.id,
                        fileName,
                        fileType: fileName.split(".").pop() ?? "document",
                        fileUrlOrKey: "",
                        uploadedBy: "owner",
                        issuer,
                        filingReferenceNumber: "",
                        notes: "",
                      }),
                      "Filing proof",
                      () => {
                        toast.success("Proof filed");
                        onFiled();
                      },
                    )
                  }
                />
              );
            })}
        </div>

        <VendorSection
          vendors={vendors.map(toVendor)}
          open={showVendorForm}
          onToggle={() => setShowVendorForm((v) => !v)}
          onAdd={(fields, onSaved) =>
            call(addVendor(fields), "Adding vendor", () => {
              toast.success("Vendor added");
              setShowVendorForm(false);
              onSaved();
            })
          }
        />

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FileCheck2 className="size-3.5" /> Compliance history
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {history.slice(0, 12).map((event) => (
              <li key={event.id.toString()} className="flex gap-2">
                <span className="tabular-nums">{event.at.toLocaleDateString()}</span>
                <span className="text-foreground/80">{event.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function ObligationRow({
  shortName,
  title,
  status,
  dueDate,
  vendorLabel,
  evidenceCount,
  missingRequired,
  vendors,
  onStatus,
  onAssign,
  onAddProof,
}: {
  shortName: string;
  title: string;
  status: string;
  dueDate: Date | null;
  vendorLabel: string | null;
  evidenceCount: number;
  missingRequired: string[];
  vendors: Vendor[];
  onStatus: (status: string) => void;
  onAssign: (vendorId: number) => void;
  onAddProof: (fileName: string, issuer: string, onFiled: () => void) => void;
}) {
  const [proofName, setProofName] = useState("");
  const [issuer, setIssuer] = useState("");

  return (
    <div className="space-y-2 rounded-xl border bg-background px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            <span className="font-mono text-xs text-muted-foreground">{shortName}</span> {title}
          </p>
          <p className="text-xs text-muted-foreground">
            {dueDate ? `Due ${dueDate.toLocaleDateString()}` : "No dated deadline"}
            {vendorLabel ? ` · ${vendorLabel}` : " · unassigned"}
            {` · ${evidenceCount} proof file${evidenceCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <select
          value={status}
          onChange={(event) => onStatus(event.target.value)}
          aria-label="Obligation status"
          className={`rounded-md border bg-background px-2 py-1 text-xs ${STATUS_TONE[status] ?? ""}`}
        >
          {OBLIGATION_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {missingRequired.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {missingRequired.map((item) => (
            <Badge key={item} variant="outline" className="text-[10px] text-amber-600">
              missing: {item}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={proofName}
          onChange={(e) => setProofName(e.target.value)}
          aria-label="Proof file name"
          placeholder="Proof file name (e.g. LL84_2024_confirmation.pdf)"
          className="h-8 w-64 text-xs"
        />
        <Input
          value={issuer}
          onChange={(e) => setIssuer(e.target.value)}
          aria-label="Proof issuer"
          placeholder="Issuer"
          className="h-8 w-32 text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={proofName.trim() === ""}
          onClick={() =>
            onAddProof(proofName.trim(), issuer.trim(), () => {
              setProofName("");
              setIssuer("");
            })
          }
        >
          File proof
        </Button>
        {vendors.length > 0 && (
          <select
            defaultValue=""
            onChange={(event) => event.target.value && onAssign(Number(event.target.value))}
            aria-label="Assign a vendor"
            className="rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value="">Assign vendor…</option>
            {vendors.map((vendor) => (
              <option key={vendor.id.toString()} value={vendor.id.toString()}>
                {vendor.name} ({vendor.roleType.replace(/_/g, " ")})
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function VendorSection({
  vendors,
  open,
  onToggle,
  onAdd,
}: {
  vendors: BinderVendor[];
  open: boolean;
  onToggle: () => void;
  onAdd: (
    fields: {
      name: string;
      company: string;
      roleType: string;
      email: string;
      phone: string;
      licenseNumber: string;
      licenseType: string;
      notes: string;
    },
    onSaved: () => void,
  ) => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [roleType, setRoleType] = useState(VENDOR_ROLES[0]);

  return (
    <div className="rounded-xl border bg-muted/30 px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Vendors & professionals ({vendors.length})</p>
        <Button size="sm" variant="ghost" onClick={onToggle}>
          <Plus className="mr-1 size-3.5" /> Add vendor
        </Button>
      </div>

      {vendors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {vendors.map((vendor) => (
            <li key={vendor.id}>
              <span className="text-foreground/80">{vendor.name}</span>
              {vendor.company ? ` · ${vendor.company}` : ""} · {vendor.roleType.replace(/_/g, " ")}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Vendor name"
            placeholder="Name"
            className="h-8 w-40 text-xs"
          />
          <Input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            aria-label="Vendor company"
            placeholder="Company"
            className="h-8 w-40 text-xs"
          />
          <select
            value={roleType}
            onChange={(e) => setRoleType(e.target.value)}
            aria-label="Vendor role"
            className="rounded-md border bg-background px-2 py-1 text-xs"
          >
            {VENDOR_ROLES.map((role) => (
              <option key={role} value={role}>
                {role.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={name.trim() === ""}
            onClick={() =>
              onAdd(
                {
                  name: name.trim(),
                  company: company.trim(),
                  roleType,
                  email: "",
                  phone: "",
                  licenseNumber: "",
                  licenseType: "",
                  notes: "",
                },
                () => {
                  setName("");
                  setCompany("");
                },
              )
            }
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { type ReactNode, useMemo, useState } from "react";

import { Download, FileText, FolderArchive, Leaf, Printer, Route, Sparkles } from "lucide-react";

import { ComplianceBinder } from "@/components/compliance/ComplianceBinder";
import { ComplianceReport } from "@/components/dashboard/ComplianceReport";
import { DeliverableDocument } from "@/components/deliverables/DeliverableDocument";
import { DocumentLibrary } from "@/components/deliverables/DocumentLibrary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useBuildingDocuments } from "@/lib/data/hooks";
import type { Building } from "@/lib/data/types";
import { deliverableToCsv } from "@/lib/deliverables/csv";
import { buildDecarbonizationDeliverable } from "@/lib/deliverables/decarbonization";
import { buildDocumentLibraryDeliverable } from "@/lib/deliverables/documentLibrary";
import { buildEmissionsDeliverable } from "@/lib/deliverables/emissions";
import type { Deliverable, DeliverableKind, DeliverableStat } from "@/lib/deliverables/types";
import type { RetrofitAssessment } from "@/lib/engine";
import { downloadCsv, slugForBuilding } from "@/lib/export-compliance";
import { cn } from "@/lib/utils";

export type OpenDoc = DeliverableKind | "report" | "binder" | null;

const STAT_TONE: Record<NonNullable<DeliverableStat["tone"]>, string> = {
  ok: "text-success",
  warn: "text-amber-600 dark:text-amber-500",
  bad: "text-destructive",
  muted: "text-foreground",
};

// Everything Fineprint has prepared for a building — the emissions position, the
// decarbonization plan, and the standardized document library — each ready to open
// and export wherever the owner submits for LL97 compliance. The wordy compliance
// report and evidence binder stay available underneath.
export function BuildingDocuments({
  building,
  assessment,
  openDoc,
  onOpenChange,
  onPrintReport,
}: {
  building: Building;
  assessment: RetrofitAssessment | null;
  openDoc: OpenDoc;
  onOpenChange: (next: OpenDoc) => void;
  onPrintReport: () => void;
}) {
  const buildingDocuments = useBuildingDocuments();
  const [generatedAt] = useState(() => new Date().toISOString());

  const libraryDocs = useMemo(
    () =>
      buildingDocuments
        .filter((document) => document.buildingId === building.id)
        .map((document) => ({
          fileName: document.fileName,
          docType: document.docType,
          documentDate: document.documentDate,
          referenceNumber: document.referenceNumber,
          note: document.note,
        })),
    [buildingDocuments, building.id],
  );

  const emissions = useMemo(() => buildEmissionsDeliverable(building, generatedAt), [building, generatedAt]);
  const decarbonization = useMemo(
    () => buildDecarbonizationDeliverable(building, assessment, generatedAt),
    [building, assessment, generatedAt],
  );
  const library = useMemo(
    () => buildDocumentLibraryDeliverable(building, libraryDocs, generatedAt),
    [building, libraryDocs, generatedAt],
  );

  const deliverableFor = (kind: DeliverableKind): Deliverable =>
    kind === "emissions" ? emissions : kind === "decarbonization" ? decarbonization : library;

  const openKind: DeliverableKind | null =
    openDoc === "emissions" || openDoc === "decarbonization" || openDoc === "documents" ? openDoc : null;

  const exportCsv = (deliverable: Deliverable) =>
    downloadCsv(`fineprint-${deliverable.kind}-${slugForBuilding(building)}.csv`, deliverableToCsv(deliverable));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <div className="print-hide mb-2">
          <h3 className="font-semibold text-sm tracking-tight">Prepared by Fineprint</h3>
          <p className="text-muted-foreground text-xs">
            Everything we&apos;ve put together for this building - open it, then export wherever you submit for LL97
            compliance.
          </p>
        </div>

        <div className="print-hide grid gap-4 lg:grid-cols-3">
          <DeliverableCard
            icon={<Leaf className="size-4" />}
            deliverable={emissions}
            open={openDoc === "emissions"}
            onToggle={() => onOpenChange(openDoc === "emissions" ? null : "emissions")}
            onExport={() => exportCsv(emissions)}
          />
          <DeliverableCard
            icon={<Route className="size-4" />}
            deliverable={decarbonization}
            open={openDoc === "decarbonization"}
            onToggle={() => onOpenChange(openDoc === "decarbonization" ? null : "decarbonization")}
            onExport={() => exportCsv(decarbonization)}
          />
          <DeliverableCard
            icon={<Sparkles className="size-4" />}
            deliverable={library}
            open={openDoc === "documents"}
            onToggle={() => onOpenChange(openDoc === "documents" ? null : "documents")}
            onExport={() => exportCsv(library)}
          />
        </div>
      </div>

      {openKind ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="print-hide flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-sm">{deliverableFor(openKind).title}</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => exportCsv(deliverableFor(openKind))}>
                  <Download className="mr-1 size-3.5" /> Export CSV
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
                  <Printer className="mr-1 size-3.5" /> Print / PDF
                </Button>
              </div>
            </div>

            {openKind === "documents" ? (
              <div className="print-hide">
                <DocumentLibrary building={building} />
              </div>
            ) : null}

            <DeliverableDocument deliverable={deliverableFor(openKind)} />
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h3 className="print-hide mb-2 font-semibold text-sm tracking-tight">Detailed working documents</h3>
        <div className="print-hide grid gap-4 lg:grid-cols-2">
          <DocCard
            icon={<FileText className="size-4" />}
            title="Compliance report"
            description="The full findings, action plan and sources - print-ready."
            actions={
              <>
                <Button
                  type="button"
                  size="sm"
                  variant={openDoc === "report" ? "default" : "outline"}
                  onClick={() => onOpenChange(openDoc === "report" ? null : "report")}
                >
                  {openDoc === "report" ? "Close" : "Open"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={onPrintReport}>
                  <Printer className="mr-1 size-3.5" /> Print
                </Button>
              </>
            }
          />
          <DocCard
            icon={<FolderArchive className="size-4" />}
            title="Evidence binder"
            description="Filings and proof tracked for every obligation."
            actions={
              <Button
                type="button"
                size="sm"
                variant={openDoc === "binder" ? "default" : "outline"}
                onClick={() => onOpenChange(openDoc === "binder" ? null : "binder")}
              >
                {openDoc === "binder" ? "Close" : "Open"}
              </Button>
            }
          />
        </div>
      </div>

      {openDoc === "report" ? <ComplianceReport building={building} assessment={assessment} /> : null}
      {openDoc === "binder" ? <ComplianceBinder building={building} /> : null}

      <div className="print-hide space-y-1 border-t pt-3 text-muted-foreground text-xs">
        <p>
          Estimates from public disclosures. Not legal advice - official compliance requires a registered design
          professional.
        </p>
        <p>1 RCNY 103-14(h) - penalty at $268/tCO₂e over the building emissions limit.</p>
      </div>
    </section>
  );
}

function DeliverableCard({
  icon,
  deliverable,
  open,
  onToggle,
  onExport,
}: {
  icon: ReactNode;
  deliverable: Deliverable;
  open: boolean;
  onToggle: () => void;
  onExport: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">{icon}</span>
        <span className="font-medium text-sm">{deliverable.title}</span>
      </div>
      <p className="text-muted-foreground text-xs">{deliverable.purpose}</p>

      {deliverable.stats.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {deliverable.stats.slice(0, 3).map((stat) => (
            <div key={stat.label}>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{stat.label} </span>
              <span className={cn("font-semibold text-xs tabular-nums", STAT_TONE[stat.tone ?? "muted"])}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex gap-2 pt-1">
        <Button type="button" size="sm" variant={open ? "default" : "outline"} onClick={onToggle}>
          {open ? "Close" : "Open"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onExport}>
          <Download className="mr-1 size-3.5" /> CSV
        </Button>
      </div>
    </div>
  );
}

function DocCard({
  icon,
  title,
  description,
  actions,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actions: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border bg-card px-4 py-3.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{icon}</span>
          <span className="font-medium text-sm">{title}</span>
        </div>
        <p className="mt-1 text-muted-foreground text-xs">{description}</p>
      </div>
      <div className="flex shrink-0 gap-2">{actions}</div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";

import { FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBuildingDocuments } from "@/lib/data/hooks";
import { useDeleteBuildingDocument, useUploadBuildingDocument } from "@/lib/data/mutations";
import type { Building } from "@/lib/data/types";
import { DOC_TYPES, docTypeLabel } from "@/lib/deliverables/documentLibrary";

// Upload a document, tag it with standardized cover fields, and keep the building's
// library in one place. Fineprint stores and indexes the file and never re-keys it.
export function DocumentLibrary({ building }: { building: Building }) {
  const allDocuments = useBuildingDocuments();
  const upload = useUploadBuildingDocument();
  const remove = useDeleteBuildingDocument();
  const fileInput = useRef<HTMLInputElement>(null);

  const documents = allDocuments.filter((document) => document.buildingId === building.id);

  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState(DOC_TYPES[0].value);
  const [documentDate, setDocumentDate] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setFile(null);
    setDocumentDate("");
    setReferenceNumber("");
    if (fileInput.current) {
      fileInput.current.value = "";
    }
  };

  const onUpload = async () => {
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      await upload({
        buildingId: building.id,
        file,
        docType,
        documentDate: documentDate || null,
        referenceNumber,
        note: "",
      });
      toast.success(`Added ${file.name}`);
      reset();
    } catch (error) {
      toast.error(`Upload failed. ${(error as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const onDelete = (id: bigint, storagePath: string, fileName: string) => {
    remove({ id, storagePath }).then(
      () => toast.success(`Removed ${fileName}`),
      (error: Error) => toast.error(`Remove failed. ${error.message}`),
    );
  };

  return (
    <div className="space-y-3">
      {documents.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {documents.map((document) => (
            <li key={document.id.toString()} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{document.fileName}</p>
                  <p className="text-muted-foreground text-xs">
                    {docTypeLabel(document.docType)}
                    {document.documentDate ? ` · ${document.documentDate}` : ""}
                    {document.referenceNumber ? ` · ${document.referenceNumber}` : ""}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                onClick={() => onDelete(document.id, document.storagePath, document.fileName)}
                title="Remove document"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-muted-foreground text-sm">
          No documents yet. Upload permits, prior filings, or inspection reports to build the library.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2.5">
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
          <Upload className="mr-1 size-3.5" /> {file ? "Change file" : "Choose file"}
        </Button>
        {file ? <span className="max-w-40 truncate text-muted-foreground text-xs">{file.name}</span> : null}

        <select
          value={docType}
          onChange={(event) => setDocType(event.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          {DOC_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>

        <Input
          type="date"
          value={documentDate}
          onChange={(event) => setDocumentDate(event.target.value)}
          className="h-8 w-36 text-xs"
          title="Document date"
        />
        <Input
          value={referenceNumber}
          onChange={(event) => setReferenceNumber(event.target.value)}
          placeholder="Reference number"
          className="h-8 w-40 text-xs"
        />

        <Button type="button" size="sm" disabled={!file || uploading} onClick={onUpload}>
          {uploading ? "Uploading…" : "Add to library"}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { type ReactNode, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useAddUserRecord } from "@/lib/data/mutations";
import { withAck } from "@/lib/reducer-call";

const RECORD_TYPES = ["blueprint", "inspection_report", "spec_sheet", "utility_bill", "other"];

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

// An owner document that improves or fills in the systems model: a blueprint,
// inspection report, spec sheet, or utility bill. Uploaded either against one
// system (systemKey set) or the whole building. Fineprint keeps the file; it is
// never parsed automatically.
export function UploadRecordDialog({
  buildingId,
  systemKey,
  systemLabel,
  trigger,
}: {
  buildingId: bigint;
  systemKey?: string;
  systemLabel?: string;
  trigger: ReactNode;
}) {
  const addUserRecord = useAddUserRecord();

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [recordType, setRecordType] = useState(RECORD_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFile(null);
    setRecordType(RECORD_TYPES[0]);
    setNotes("");
  };

  const submit = async () => {
    if (!file) {
      return;
    }

    setSaving(true);

    try {
      await withAck(addUserRecord({ buildingId, systemKey, recordType, file, notes }), "Uploading record");

      toast.success("Record uploaded - it will help fill in this building's model");
      setOpen(false);
    } catch (error) {
      toast.error(`Uploading record failed: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const scopeLabel = systemLabel ? systemLabel.toLowerCase() : "this building";

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (next) {
          reset();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a record</DialogTitle>
          <DialogDescription>
            Attach a document for {scopeLabel}. Records improve or fill in Fineprint&apos;s model of the systems here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="record-file">File</Label>
            <input
              id="record-file"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="record-type">Record type</Label>
            <NativeSelect
              id="record-type"
              className="w-full"
              value={recordType}
              onChange={(event) => setRecordType(event.target.value)}
            >
              {RECORD_TYPES.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {humanize(option)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="record-notes">Note (optional)</Label>
            <Textarea
              id="record-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="What this document shows"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={submit} disabled={saving || !file}>
            {saving ? "Uploading..." : "Upload record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

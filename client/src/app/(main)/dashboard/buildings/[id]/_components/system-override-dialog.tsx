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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { SystemAssessment, SystemKey } from "@/lib/compliance/plan";
import { useSetSystemOverride } from "@/lib/data/mutations";
import { withAck } from "@/lib/reducer-call";

const PRESENCE_OPTIONS = ["confirmed", "assumed", "none", "unknown"];
const CONDITION_OPTIONS = ["failing", "aging", "serviceable", "recently_replaced", "unknown"];

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

// The owner's correction to what Fineprint inferred about one system. The form
// opens prefilled with the assessed facts; on submit only the fields the owner
// actually changed are written, and each write re-runs the emissions model
// against the corrected value.
export function SystemOverrideDialog({
  buildingId,
  systemKey,
  systemLabel,
  assessment,
  trigger,
}: {
  buildingId: bigint;
  systemKey: SystemKey;
  systemLabel: string;
  assessment: SystemAssessment | null;
  trigger: ReactNode;
}) {
  const setSystemOverride = useSetSystemOverride();

  const initialPresence = assessment?.presence ?? "unknown";
  const initialFuel = assessment?.fuel ?? "";
  const initialVintage = assessment?.vintageYear != null ? String(assessment.vintageYear) : "";
  const initialCondition = assessment?.condition ?? "unknown";

  const [open, setOpen] = useState(false);
  const [presence, setPresence] = useState(initialPresence);
  const [fuel, setFuel] = useState(initialFuel);
  const [vintage, setVintage] = useState(initialVintage);
  const [condition, setCondition] = useState(initialCondition);
  const [saving, setSaving] = useState(false);

  const resetToAssessed = () => {
    setPresence(initialPresence);
    setFuel(initialFuel);
    setVintage(initialVintage);
    setCondition(initialCondition);
  };

  const changedFields = (): Array<{ field: string; value: unknown }> => {
    const changes: Array<{ field: string; value: unknown }> = [];

    if (presence !== initialPresence) {
      changes.push({ field: "presence", value: presence });
    }
    if (fuel.trim() !== initialFuel) {
      changes.push({ field: "fuel", value: fuel.trim() === "" ? null : fuel.trim() });
    }
    if (vintage !== initialVintage) {
      changes.push({ field: "vintageYear", value: vintage === "" ? null : Number(vintage) });
    }
    if (condition !== initialCondition) {
      changes.push({ field: "condition", value: condition });
    }

    return changes;
  };

  const submit = async () => {
    const changes = changedFields();

    if (changes.length === 0) {
      setOpen(false);
      return;
    }

    setSaving(true);

    try {
      for (const change of changes) {
        await withAck(
          setSystemOverride({ buildingId, systemKey, field: change.field, value: change.value }),
          "Saving correction",
        );
      }

      toast.success("Correction saved - Fineprint is recomputing this building");
      setOpen(false);
    } catch (error) {
      toast.error(`Saving correction failed: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (next) {
          resetToAssessed();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct {systemLabel.toLowerCase()} facts</DialogTitle>
          <DialogDescription>
            These are the facts Fineprint inferred from public records. Correcting one re-runs the emissions model.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="override-presence">Presence</Label>
            <NativeSelect
              id="override-presence"
              className="w-full"
              value={presence}
              onChange={(event) => setPresence(event.target.value as SystemAssessment["presence"])}
            >
              {PRESENCE_OPTIONS.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {humanize(option)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="override-fuel">Fuel</Label>
            <Input
              id="override-fuel"
              value={fuel}
              onChange={(event) => setFuel(event.target.value)}
              placeholder="e.g. natural gas, electric, fuel oil #2"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="override-vintage">Installed year</Label>
            <Input
              id="override-vintage"
              type="number"
              inputMode="numeric"
              value={vintage}
              onChange={(event) => setVintage(event.target.value)}
              placeholder="e.g. 2008"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="override-condition">Condition</Label>
            <NativeSelect
              id="override-condition"
              className="w-full"
              value={condition}
              onChange={(event) => setCondition(event.target.value as SystemAssessment["condition"])}
            >
              {CONDITION_OPTIONS.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {humanize(option)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={submit} disabled={saving}>
            {saving ? "Saving..." : "Save correction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

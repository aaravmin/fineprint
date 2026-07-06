"use client";

import { useEffect, useState } from "react";

import { Plus } from "lucide-react";

import { AddressAutocomplete } from "@/components/address-autocomplete";
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
import { readRecentAddresses, useRequestBuilding } from "@/hooks/use-request-building";

const INPUT_CLASSES =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/20";

// The single intake entry point, opened from the Overview and the Buildings
// table. Holds the autocomplete, the recents chips, and the optimistic submit;
// closes itself once an address is accepted.
export function AddBuildingDialog({ className }: { className?: string }) {
  const { submit } = useRequestBuilding();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setRecents(readRecentAddresses());
    }
  }, [open]);

  const handleSubmit = (value: string) => {
    if (submit(value)) {
      setAddress("");
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className={className}>
          <Plus className="mr-1 size-4" /> Add building
        </Button>
      </DialogTrigger>
      <DialogContent
        // The autocomplete list renders in a body portal; a pointer-down on a
        // suggestion must not read as an outside click and close the dialog.
        onInteractOutside={(event: CustomEvent<{ originalEvent: Event }>) => {
          const target = event.detail.originalEvent.target as HTMLElement | null;
          if (target?.closest('[role="listbox"]')) {
            event.preventDefault();
          }
        }}
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit(address);
          }}
        >
          <DialogHeader>
            <DialogTitle>Add a building</DialogTitle>
            <DialogDescription>
              Enter a NYC address and an agent pulls the city&apos;s records to build its compliance plan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <AddressAutocomplete
              value={address}
              onValueChange={setAddress}
              placeholder="Street address with borough"
              inputClassName={INPUT_CLASSES}
            />

            {recents.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Recent</p>
                <div className="flex flex-wrap gap-1.5">
                  {recents.map((recent) => (
                    <Button key={recent} type="button" variant="outline" size="sm" onClick={() => handleSubmit(recent)}>
                      {recent}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit">Add building</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

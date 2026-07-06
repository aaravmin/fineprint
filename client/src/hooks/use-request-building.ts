"use client";

import { useCallback } from "react";

import { toast } from "sonner";

import { useRequestBuildingCall } from "@/lib/data/mutations";
import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";
import { withAck } from "@/lib/reducer-call";

const RECENT_ADDRESSES_KEY = "fineprint:recent-addresses";
const RECENT_LIMIT = 6;

export function readRecentAddresses(): string[] {
  const raw = getLocalStorageValue(RECENT_ADDRESSES_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function rememberAddress(address: string): string[] {
  const trimmed = address.trim();
  if (!trimmed) {
    return readRecentAddresses();
  }

  const next = [trimmed, ...readRecentAddresses().filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    RECENT_LIMIT,
  );

  setLocalStorageValue(RECENT_ADDRESSES_KEY, JSON.stringify(next));
  return next;
}

// Queue a building intake optimistically: confirm on the spot, remember the
// address for the recents list, and surface a failure if the ack comes back
// negative. The reducer is the source of truth either way. Returns whether the
// address was accepted, so a caller can clear its input and close a dialog.
export function useRequestBuilding() {
  const requestBuilding = useRequestBuildingCall();

  const submit = useCallback(
    (rawAddress: string): boolean => {
      const address = rawAddress.trim();
      if (!address) {
        toast.error("Enter a street address with the borough");
        return false;
      }

      rememberAddress(address);
      toast.success("Intake queued. An agent is pulling the city's records now");

      withAck(requestBuilding({ address }), `Intake for "${address}"`).catch((error: Error) => {
        toast.error(`Intake for "${address}" failed: ${error.message}`);
      });

      return true;
    },
    [requestBuilding],
  );

  return { submit };
}

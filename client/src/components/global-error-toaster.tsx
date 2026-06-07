"use client";

import { useEffect, useRef } from "react";

import { toast } from "sonner";

// Last-resort catches: anything that escapes every try/catch still surfaces
// as a toast instead of dying in the console. Throttled per message so a
// failing loop produces one toast, not a stack of them.
const THROTTLE_MS = 10_000;

export function GlobalErrorToaster() {
  const lastShown = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const show = (message: string) => {
      const now = Date.now();
      const last = lastShown.current.get(message) ?? 0;
      if (now - last < THROTTLE_MS) {
        return;
      }
      lastShown.current.set(message, now);
      toast.error(message);
    };

    const onError = (event: ErrorEvent) => {
      // Cross-origin scripts report only "Script error." with no detail;
      // toasting that tells the user nothing actionable.
      if (!event.message || event.message === "Script error.") {
        return;
      }
      show(event.message);
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "A background request failed.";
      show(message);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

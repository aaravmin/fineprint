"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: Props) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive-subtle text-destructive">
        <TriangleAlert className="size-6" />
      </span>

      <div className="space-y-1.5">
        <h1 className="font-heading text-xl font-bold tracking-tight">Something broke on this page</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The dashboard hit an unexpected error. Your data is safe — try again, and if it keeps happening, reload the
          page.
        </p>
        {error.digest && <p className="font-mono text-[11px] text-muted-foreground/70">Reference: {error.digest}</p>}
      </div>

      <Button onClick={reset}>
        <RotateCcw className="size-3.5" /> Try again
      </Button>
    </div>
  );
}

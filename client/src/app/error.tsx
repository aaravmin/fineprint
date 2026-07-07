"use client";

import Link from "next/link";

import { RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: Props) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-destructive-subtle text-destructive">
        <TriangleAlert className="size-7" />
      </span>

      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Something went wrong</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          An unexpected error interrupted the page. You can try again, or head back to the dashboard.
        </p>
        {error.digest && <p className="font-mono text-[11px] text-muted-foreground/70">Reference: {error.digest}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw className="size-3.5" /> Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

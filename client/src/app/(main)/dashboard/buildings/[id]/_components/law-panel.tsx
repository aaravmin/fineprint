"use client";

import { CalendarClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtUsd } from "@/lib/engine";
import type { LawProjection } from "@/lib/law-projections";
import type { Task } from "@/module_bindings/types";

import { STATUS_DOT } from "./compliance-section";

// A single filing law made as actionable as LL97: what the penalty grows to if
// the obligation stays unmet (the projection), the building's live standing
// (from its task), and the concrete filing steps that satisfy it (the plan).
export function LawPanel({
  lawName,
  projection,
  task,
}: {
  lawName: string;
  projection: LawProjection;
  task: Task | undefined;
}) {
  const deadline = task ? task.deadline.toDate() : null;
  const overdue = task ? task.slaBreached || (deadline !== null && deadline.getTime() < Date.now()) : false;
  // The penalty if the obligation goes unmet: the first accrual step and the
  // cap it builds to, stated in words rather than drawn as bars.
  const firstStep = projection.accrual[0];
  const cap = projection.accrual[projection.accrual.length - 1];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{lawName}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{projection.cadence}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {task && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={`size-1.5 rounded-full ${STATUS_DOT[task.status] ?? "bg-muted-foreground/50"}`}
                />
                {task.status.replace("_", " ")}
              </span>
            )}
            {task?.slaBreached && (
              <Badge variant="destructive" className="text-[10px]">
                SLA breached
              </Badge>
            )}
            {deadline && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5" />
                {deadline.toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What's at stake
          </p>
          {firstStep && cap ? (
            <p className="mt-2 text-sm leading-relaxed">
              <span className={overdue ? "font-semibold text-destructive" : "font-medium"}>
                {overdue ? "Now accruing: " : "If unmet: "}
              </span>
              {firstStep.cumulativeUsd === cap.cumulativeUsd ? (
                <>{fmtUsd(cap.cumulativeUsd)} ({cap.label}).</>
              ) : (
                <>
                  {fmtUsd(firstStep.cumulativeUsd)} once {firstStep.label}, building to{" "}
                  {fmtUsd(cap.cumulativeUsd)} ({cap.label}).
                </>
              )}
            </p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {projection.variableNote}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your plan
          </p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed marker:text-xs marker:text-muted-foreground">
            {projection.steps.map(step => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
          Basis: {projection.basis}. Figures are public statutory penalty rates, not a
          quote or legal advice.
        </p>
      </CardContent>
    </Card>
  );
}

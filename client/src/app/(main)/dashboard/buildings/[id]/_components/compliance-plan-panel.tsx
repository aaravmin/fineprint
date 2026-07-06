"use client";

import type { ReactNode } from "react";

import { InfoHint } from "@/components/dashboard/InfoHint";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { Badge } from "@/components/ui/badge";
import type { CompliancePlan } from "@/lib/compliance/plan";
import { dedash } from "@/lib/compliance/plan";

export interface LawStatusRow {
  short: string;
  name: string;
  status: string;
  exposureUsd?: number;
  overdue: boolean;
}

// The dispositions the plan already reasoned out (which law is handled how);
// falls back to per-task status rows when a building has no stored plan yet.
export function CompliancePlanPanel({
  plan,
  fallbackRows,
}: {
  plan: CompliancePlan | null;
  fallbackRows: LawStatusRow[];
}) {
  if (!plan || plan.dispositions.length === 0) {
    return (
      <SectionCard title="Compliance plan">
        <ul className="divide-y">
          {fallbackRows.map((row) => (
            <li key={row.short} className="flex items-center justify-between gap-2 py-2.5">
              <span className="text-sm font-medium">{dedash(row.name)}</span>
              {row.overdue ? (
                <StatusPill tone="destructive">Overdue</StatusPill>
              ) : (
                <FallbackStatusPill status={row.status} />
              )}
            </li>
          ))}
          {fallbackRows.length === 0 ? (
            <li className="py-4 text-sm text-muted-foreground">No obligations on file yet.</li>
          ) : null}
        </ul>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Compliance plan">
      <ul className="divide-y">
        {plan.dispositions.map((disposition) => (
          <li key={disposition.lawId} className="py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{dedash(disposition.lawName)}</span>
              <HandledByPill handledBy={disposition.handledBy} />
            </div>
            {disposition.detail ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={dedash(disposition.detail)}>
                {dedash(disposition.detail)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">{pathwayLabel(plan.pathway)}</p>

        {plan.crossCredits.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">Cross-credits</span>
            {plan.crossCredits.map((lawId) => (
              <Badge key={lawId} variant="outline" className="text-[10px]">
                {lawId.toUpperCase()}
              </Badge>
            ))}
          </div>
        ) : null}

        {plan.notes.length > 0 ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {plan.notes.length} {plan.notes.length === 1 ? "note" : "notes"}
            <InfoHint text={dedash(plan.notes.join("  •  "))} label="Plan notes" />
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

function pathwayLabel(pathway: CompliancePlan["pathway"]): string {
  if (pathway === "standard") {
    return "Standard pathway - $268 per ton over the cap.";
  }
  if (pathway === "article321") {
    return "Article 321 - affordable-housing pathway.";
  }
  return "Pathway not yet determined.";
}

function HandledByPill({ handledBy }: { handledBy: string }): ReactNode {
  switch (handledBy) {
    case "retrofit_measures":
      return <Badge variant="default">Retrofit plan</Badge>;
    case "filing":
      return <Badge variant="outline">File</Badge>;
    case "already_compliant":
      return <StatusPill tone="success">Compliant</StatusPill>;
    case "needs_attention":
      return <StatusPill tone="destructive">Needs attention</StatusPill>;
    default:
      return <StatusPill tone="muted">{dedash(handledBy.replace(/_/g, " "))}</StatusPill>;
  }
}

function FallbackStatusPill({ status }: { status: string }): ReactNode {
  if (status === "done" || status === "approved") {
    return <StatusPill tone="success">Compliant</StatusPill>;
  }
  if (status === "missing") {
    return <StatusPill tone="muted">Not started</StatusPill>;
  }
  return <StatusPill tone="warning">In progress</StatusPill>;
}

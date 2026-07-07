"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { reducers, tables } from "@/lib/db";
import { useReducer, useTable } from "@/lib/db/react";
import type { Task } from "@/lib/db/types";
import { fmtUsd } from "@/lib/engine";
import { lawsInOrder } from "@/lib/laws/lawRegistry";
import { withAck } from "@/lib/reducer-call";

const TASK_LAWS = lawsInOrder().filter((law) => law.law_id !== "ll96");

// Status reads as a dot + word, one fixed-width column, so every row lines
// up no matter the state. Dot carries the color; text stays quiet.
const STATUS_DOT: Record<string, string> = {
  open: "bg-muted-foreground/50",
  claimed: "bg-foreground/70",
  in_review: "bg-amber-500",
  approved: "bg-success",
  done: "bg-success",
  rejected: "bg-destructive",
};

// The whole-building plan, serialized at intake, disposes of every law once.
// We fold each law's disposition into its ledger row so the "what we'll do"
// lives next to the "what an agent drafted" — one place per law, not two cards.
interface PlanDisposition {
  lawId: string;
  handledBy: string;
  detail: string;
}

const HANDLING_LABEL: Record<string, string> = {
  retrofit_measures: "Retrofit plan",
  filing: "File",
  already_compliant: "Compliant",
  needs_attention: "Needs attention",
};

const HANDLING_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  retrofit_measures: "default",
  filing: "outline",
  already_compliant: "secondary",
  needs_attention: "destructive",
};

function dispositionsByLaw(planJson: string | undefined): Map<string, PlanDisposition> {
  const byLaw = new Map<string, PlanDisposition>();
  if (!planJson) {
    return byLaw;
  }

  try {
    const plan = JSON.parse(planJson);
    if (Array.isArray(plan?.dispositions)) {
      for (const disposition of plan.dispositions as PlanDisposition[]) {
        byLaw.set(disposition.lawId, disposition);
      }
    }
  } catch (error) {
    console.error(
      `[compliance] corrupt compliance-plan JSON, falling back to task-derived laws: ${(error as Error).message}`,
    );
    return byLaw;
  }

  return byLaw;
}

// Drafts arrive as plain text with a known shape: a title line, prose,
// numbered steps, labeled data blocks ("Fine projection:" + indented rows),
// a Deadline line, and a Sources footnote. Parsing that into typography
// beats dumping the whole thing in a <pre>.
type DraftBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "steps"; items: string[] }
  | { kind: "data"; label: string; rows: string[] }
  | { kind: "deadline"; date: string }
  | { kind: "sources"; items: string[] };

function draftBlockKey(block: DraftBlock): string {
  switch (block.kind) {
    case "paragraph":
      return `paragraph:${block.text}`;
    case "steps":
      return `steps:${block.items.join("|")}`;
    case "data":
      return `data:${block.label}:${block.rows.join("|")}`;
    case "deadline":
      return `deadline:${block.date}`;
    case "sources":
      return `sources:${block.items.join("|")}`;
  }
}

function parseDraft(body: string): DraftBlock[] {
  const lines = body.split("\n");
  const blocks: DraftBlock[] = [];
  let index = 0;

  // The title line repeats what the row and page header already say.
  while (index < lines.length && lines[index].trim() === "") index++;
  index++;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === "") {
      index++;
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s*/, ""));
        index++;
      }
      blocks.push({ kind: "steps", items });
      continue;
    }

    if (/^Deadline:\s/.test(trimmed)) {
      blocks.push({ kind: "deadline", date: trimmed.replace(/^Deadline:\s*/, "") });
      index++;
      continue;
    }

    if (trimmed === "Sources:") {
      index++;
      const items: string[] = [];
      while (index < lines.length && /^\s*-\s/.test(lines[index])) {
        items.push(lines[index].trim().replace(/^-\s*/, ""));
        index++;
      }
      blocks.push({ kind: "sources", items });
      continue;
    }

    // "Label:" followed by indented rows is a data block (fine projection,
    // retrofit summary).
    if (trimmed.endsWith(":") && index + 1 < lines.length && /^\s{2,}\S/.test(lines[index + 1])) {
      const label = trimmed.slice(0, -1);
      index++;
      const rows: string[] = [];
      while (index < lines.length && /^\s{2,}\S/.test(lines[index])) {
        rows.push(lines[index].trim());
        index++;
      }
      blocks.push({ kind: "data", label, rows });
      continue;
    }

    blocks.push({ kind: "paragraph", text: trimmed });
    index++;
  }

  return blocks;
}

function DraftBody({ body }: { body: string }) {
  const blocks = parseDraft(body);

  if (blocks.length === 0) {
    return <p className="text-sm leading-relaxed whitespace-pre-wrap">{body}</p>;
  }

  return (
    <div className="space-y-3">
      {blocks.map((block) => {
        switch (block.kind) {
          case "paragraph":
            return (
              <p key={draftBlockKey(block)} className="text-sm leading-relaxed">
                {block.text}
              </p>
            );
          case "steps":
            return (
              <ol
                key={draftBlockKey(block)}
                className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed marker:text-xs marker:text-muted-foreground"
              >
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            );
          case "data":
            return (
              <div key={draftBlockKey(block)}>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{block.label}</p>
                <pre className="overflow-x-auto rounded-lg bg-muted/50 px-3 py-2.5 font-mono text-xs leading-relaxed">
                  {block.rows.join("\n")}
                </pre>
              </div>
            );
          case "deadline":
            return (
              <p key={draftBlockKey(block)} className="text-sm">
                <span className="text-muted-foreground">Due</span> <span className="font-medium">{block.date}</span>
              </p>
            );
          case "sources":
            return (
              <div key={draftBlockKey(block)} className="text-xs text-muted-foreground">
                <p className="mb-1 font-medium">Sources</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

export function ComplianceSection({ buildingId, planJson }: { buildingId: number; planJson?: string }) {
  const [tasks] = useTable(tables.task);
  const [submissions] = useTable(tables.submission);
  const [workers] = useTable(tables.worker);
  const approve = useReducer(reducers.approve);
  const reject = useReducer(reducers.reject);
  const markDone = useReducer(reducers.markDone);
  const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);

  const buildingTasks = tasks.filter((task) => task.buildingId === buildingId);
  const dispositions = dispositionsByLaw(planJson);

  const applicableLaws = TASK_LAWS.filter(
    (law) => buildingTasks.some((task) => task.lawId === law.law_id) || dispositions.has(law.law_id),
  );
  const inapplicableLaws = TASK_LAWS.filter((law) => !applicableLaws.includes(law));

  function review(task: Task, verdict: "approve" | "reject") {
    setPendingTaskId(task.id);

    const call =
      verdict === "approve"
        ? approve({ taskId: task.id, note: "approved from the building page" })
        : reject({ taskId: task.id, note: "rejected from the building page" });

    withAck(call, "The review verdict")
      .then(() => {
        if (verdict === "approve") {
          toast.success("Draft approved");
        } else {
          toast("Draft rejected. Task returned to the queue");
        }
      })
      .catch((error: Error) => toast.error(`Review failed: ${error.message}`))
      .finally(() => setPendingTaskId(null));
  }

  function confirmFiled(task: Task) {
    setPendingTaskId(task.id);

    withAck(markDone({ taskId: task.id, note: "filing confirmed" }), "The filing")
      .then(() => toast.success("Filing confirmed"))
      .catch((error: Error) => toast.error(`Could not close out: ${error.message}`))
      .finally(() => setPendingTaskId(null));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compliance plan</CardTitle>
        <p className="text-sm text-muted-foreground">
          Every applicable law, how it&apos;s handled, what it costs, and the agent draft waiting on your sign-off.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <Accordion type="multiple" className="w-full">
          {applicableLaws.map((law) => {
            const lawTask = buildingTasks.find((task) => task.lawId === law.law_id);
            const disposition = dispositions.get(law.law_id);
            const latestSubmission = lawTask
              ? [...submissions]
                  .filter((submission) => submission.taskId === lawTask.id)
                  .sort((a, b) => (a.id > b.id ? -1 : 1))[0]
              : undefined;
            const draftingAgent = latestSubmission
              ? workers.find((worker) => worker.id === latestSubmission.workerId)
              : undefined;

            const row = (
              <div className="grid w-full grid-cols-[4.5rem_1fr_auto] items-center gap-3 @md/main:grid-cols-[4.5rem_1fr_7rem_8rem]">
                <span className="font-mono text-xs font-medium text-muted-foreground">{law.short_name}</span>

                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <span className="truncate">{law.display_name}</span>
                  {disposition && (
                    <Badge
                      variant={HANDLING_VARIANT[disposition.handledBy] ?? "secondary"}
                      className="shrink-0 text-[10px]"
                    >
                      {HANDLING_LABEL[disposition.handledBy] ?? disposition.handledBy}
                    </Badge>
                  )}
                  {lawTask?.slaBreached && (
                    <Badge variant="destructive" className="shrink-0 text-[10px]">
                      SLA breached
                    </Badge>
                  )}
                </span>

                <span className="hidden text-right text-xs text-muted-foreground tabular-nums @md/main:inline">
                  {lawTask?.fineEstimateUsd !== undefined ? `${fmtUsd(lawTask.fineEstimateUsd)}/yr` : ""}
                </span>

                <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                  {lawTask ? (
                    <>
                      <span
                        className={`size-1.5 rounded-full ${STATUS_DOT[lawTask.status] ?? "bg-muted-foreground/50"}`}
                      />
                      {lawTask.status.replace("_", " ")}
                    </>
                  ) : (
                    <span className="text-muted-foreground/50">planned</span>
                  )}
                </span>
              </div>
            );

            return (
              <AccordionItem key={law.law_id} value={law.law_id} className="group border-b last:border-b-0">
                <AccordionTrigger className="items-center px-6 py-3.5 transition-colors duration-200 hover:bg-muted/40 hover:no-underline">
                  {row}
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-5">
                  <div className="max-w-[68ch] space-y-4 pt-1">
                    {disposition && (
                      <p className="text-sm leading-relaxed text-muted-foreground">{disposition.detail}</p>
                    )}

                    {lawTask && latestSubmission && (
                      <>
                        <DraftBody body={latestSubmission.body} />

                        <div className="flex items-center justify-between gap-3 border-t pt-3">
                          <p className="min-w-0 truncate text-xs text-muted-foreground">
                            Drafted by{" "}
                            <span className="font-medium text-foreground/70">{draftingAgent?.name ?? "an agent"}</span>{" "}
                            · {latestSubmission.submittedAt.toLocaleString()}
                          </p>

                          {lawTask.status === "in_review" && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={pendingTaskId === lawTask.id}
                                onClick={() => review(lawTask, "approve")}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pendingTaskId === lawTask.id}
                                onClick={() => review(lawTask, "reject")}
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                          {lawTask.status === "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pendingTaskId === lawTask.id}
                              onClick={() => confirmFiled(lawTask)}
                            >
                              Mark filed
                            </Button>
                          )}
                        </div>
                      </>
                    )}

                    {lawTask && !latestSubmission && (
                      <p className="text-xs text-muted-foreground">
                        No submission yet. An agent will draft this filing.
                      </p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        {inapplicableLaws.length > 0 && (
          <p className="border-t px-6 py-3 text-xs text-muted-foreground">
            Not applicable to this building: {inapplicableLaws.map((law) => law.short_name).join(", ")}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

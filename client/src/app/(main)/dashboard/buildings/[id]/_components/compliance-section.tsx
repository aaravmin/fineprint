"use client";

import { useState } from "react";

import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { useReducer, useTable } from "spacetimedb/react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtUsd } from "@/lib/engine";
import { LAW_REGISTRY } from "@/lib/laws/lawRegistry";
import { withAck } from "@/lib/reducer-call";
import { reducers, tables } from "@/module_bindings/index";
import type { Task } from "@/module_bindings/types";

// Status reads as a dot + word, one fixed-width column, so every row lines
// up no matter the state. Dot carries the color; text stays quiet.
export const STATUS_DOT: Record<string, string> = {
  open: "bg-muted-foreground/50",
  claimed: "bg-foreground/70",
  in_review: "bg-amber-500",
  approved: "bg-success",
  done: "bg-success",
  rejected: "bg-destructive",
};

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
    if (
      trimmed.endsWith(":") &&
      index + 1 < lines.length &&
      /^\s{2,}\S/.test(lines[index + 1])
    ) {
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
      {blocks.map((block, blockIndex) => {
        switch (block.kind) {
          case "paragraph":
            return (
              <p key={blockIndex} className="text-sm leading-relaxed">
                {block.text}
              </p>
            );
          case "steps":
            return (
              <ol
                key={blockIndex}
                className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed marker:text-xs marker:text-muted-foreground"
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ol>
            );
          case "data":
            return (
              <div key={blockIndex}>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {block.label}
                </p>
                <pre className="overflow-x-auto rounded-lg bg-muted/50 px-3 py-2.5 font-mono text-xs leading-relaxed">
                  {block.rows.join("\n")}
                </pre>
              </div>
            );
          case "deadline":
            return (
              <p key={blockIndex} className="text-sm">
                <span className="text-muted-foreground">Due</span>{" "}
                <span className="font-medium">{block.date}</span>
              </p>
            );
          case "sources":
            return (
              <div key={blockIndex} className="text-xs text-muted-foreground">
                <p className="mb-1 font-medium">Sources</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {block.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{item}</li>
                  ))}
                </ul>
              </div>
            );
        }
      })}
    </div>
  );
}

export function ComplianceSection({
  buildingId,
  onlyLawId,
}: {
  buildingId: bigint;
  onlyLawId?: string;
}) {
  const [tasks] = useTable(tables.task);
  const [submissions] = useTable(tables.submission);
  const [workers] = useTable(tables.worker);
  const approve = useReducer(reducers.approve);
  const reject = useReducer(reducers.reject);
  const markDone = useReducer(reducers.markDone);
  const [pendingTaskId, setPendingTaskId] = useState<bigint | null>(null);
  const reduceMotion = useReducedMotion();

  const buildingTasks = tasks.filter(task => task.buildingId === buildingId);
  // LL96 (PACE financing) is an opportunity, not an obligation — it spawns no
  // task, so it never belongs in the obligation ledger where a missing task
  // reads as non-compliance. Its own tab surfaces it on its own terms.
  const laws = (
    onlyLawId ? LAW_REGISTRY.filter(law => law.law_id === onlyLawId) : LAW_REGISTRY
  ).filter(law => law.law_id !== "ll96");

  function review(task: Task, verdict: "approve" | "reject") {
    setPendingTaskId(task.id);

    const call =
      verdict === "approve"
        ? approve({ taskId: task.id, note: "approved from the building page" })
        : reject({ taskId: task.id, note: "rejected from the building page" });

    if (verdict === "approve") {
      toast.success("Draft approved");
    } else {
      toast("Draft rejected. Task returned to the queue");
    }

    withAck(call, "The review verdict")
      .catch((error: Error) => toast.error(`Review failed: ${error.message}`))
      .finally(() => setPendingTaskId(null));
  }

  function confirmFiled(task: Task) {
    setPendingTaskId(task.id);
    toast.success("Filing confirmed");

    withAck(markDone({ taskId: task.id, note: "filing confirmed" }), "The filing")
      .catch((error: Error) => toast.error(`Could not close out: ${error.message}`))
      .finally(() => setPendingTaskId(null));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compliance</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Accordion type="multiple" className="w-full">
          {laws.map((law, index) => {
            const lawTask = buildingTasks.find(task => task.lawId === law.law_id);
            const latestSubmission = lawTask
              ? [...submissions]
                  .filter(submission => submission.taskId === lawTask.id)
                  .sort((a, b) => (a.id > b.id ? -1 : 1))[0]
              : undefined;
            const draftingAgent = latestSubmission
              ? workers.find(worker => worker.id === latestSubmission.workerId)
              : undefined;

            const row = (
              <div className="grid w-full grid-cols-[4.5rem_1fr_auto] items-center gap-3 @md/main:grid-cols-[4.5rem_1fr_7rem_8rem]">
                <span className="font-mono text-xs font-medium text-muted-foreground">
                  {law.short_name}
                </span>

                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <span className="truncate">{law.display_name}</span>
                  {lawTask?.slaBreached && (
                    <Badge variant="destructive" className="shrink-0 text-[10px]">
                      SLA breached
                    </Badge>
                  )}
                </span>

                <span className="hidden text-right text-xs text-muted-foreground tabular-nums @md/main:inline">
                  {lawTask?.fineEstimateUsd !== undefined
                    ? `${fmtUsd(lawTask.fineEstimateUsd)}/yr`
                    : ""}
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
                    <span className="italic">missing</span>
                  )}
                </span>
              </div>
            );

            return (
              <motion.div
                key={law.law_id}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.35,
                  delay: index * 0.04,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {lawTask ? (
                  <AccordionItem
                    value={law.law_id}
                    className="group border-b last:border-b-0"
                  >
                    <AccordionTrigger className="items-center px-6 py-3.5 transition-colors duration-200 hover:bg-muted/40 hover:no-underline">
                      {row}
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-5">
                      {latestSubmission ? (
                        <div className="max-w-[68ch] space-y-4 pt-1">
                          <DraftBody body={latestSubmission.body} />

                          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                            <p className="text-xs text-muted-foreground">
                              Drafted by{" "}
                              <span className="font-medium text-foreground/70">
                                {draftingAgent?.name ?? "an agent"}
                              </span>{" "}
                              · {latestSubmission.submittedAt.toDate().toLocaleString()}
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
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No submission yet. An agent will draft this filing.
                        </p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ) : (
                  <div className="border-b px-6 py-3.5 opacity-60 last:border-b-0">
                    {row}
                  </div>
                )}
              </motion.div>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

// The event table is the internal audit trail — every reducer appends a row
// with a snake_case `kind`. The dashboard reads it live in three places (the
// toaster, the notifications inbox, the activity log), so the vocabulary lives
// here once: which kinds are noise, which read as errors or wins, and the
// human label each one wears on screen. Raw kinds never reach the UI as text —
// "worker_reaped" is a database word, not something an owner should read.

// Fire constantly or describe module lifecycle; never worth interrupting a
// human. Filtered out of every customer-facing surface.
export const NOISE_KINDS = new Set(["heartbeat", "system"]);

export const ERROR_KINDS = new Set([
  "task_rejected",
  "worker_killed",
  "worker_reaped",
  "sla_breached",
  "intake_failed",
]);

export const SUCCESS_KINDS = new Set(["task_approved", "building_ingested"]);

const KIND_LABELS: Record<string, string> = {
  task_claimed: "Claimed",
  work_submitted: "Draft submitted",
  task_approved: "Approved",
  task_rejected: "Sent back",
  task_done: "Filed",
  task_released: "Returned to queue",
  worker_registered: "Agent online",
  worker_killed: "Agent stopped",
  worker_reaped: "Agent timed out",
  workers_pruned: "Fleet swept",
  sla_breached: "Deadline at risk",
  building_requested: "Address queued",
  building_added: "Building added",
  building_ingested: "Building added",
  building_updated: "Building updated",
  intake_failed: "Intake failed",
  binder_seeded: "Binder created",
  vendor_added: "Vendor added",
  vendor_assigned: "Vendor assigned",
  obligation_status_changed: "Status updated",
  evidence_added: "Evidence added",
  evidence_reviewed: "Evidence reviewed",
  binder_note_added: "Note added",
};

// The editorial label for an event kind, falling back to a title-cased version
// of any kind added later that hasn't earned bespoke copy yet.
export function eventLabel(kind: string): string {
  const known = KIND_LABELS[kind];
  if (known) {
    return known;
  }
  return kind.replace(/_/g, " ").replace(/^\w/, (first) => first.toUpperCase());
}

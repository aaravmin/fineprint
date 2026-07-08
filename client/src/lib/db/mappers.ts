// Database rows in, component vocabulary out: snake_case keys become
// camelCase, timestamptz strings become Dates, and SQL NULL becomes
// `undefined` so optional-field checks read the way they always have.

import type { TableName } from "./index";
import { ROW_SCHEMAS } from "./rowSchemas";

// One log per table per session: a schema drift repeats on every Realtime
// refresh, and one shout is enough to send someone to regenerate the types.
const reportedMismatches = new Set<TableName>();

function validateRowInDev(table: TableName, row: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production" || reportedMismatches.has(table)) {
    return;
  }
  const result = ROW_SCHEMAS[table].safeParse(row);
  if (!result.success) {
    reportedMismatches.add(table);
    console.error(
      `[db] "${table}" row does not match the expected schema — regenerate types with "npm run db:types"?`,
      result.error.issues,
      row,
    );
  }
}

const DATE_KEYS = new Set([
  "created_at",
  "updated_at",
  "completed_at",
  "submitted_at",
  "uploaded_at",
  "last_heartbeat",
  "deadline",
  "due_date",
  "document_date",
  "expiration_date",
  "at",
]);

function camelCase(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

export function mapRow(table: TableName, row: Record<string, unknown>): unknown {
  validateRowInDev(table, row);

  const mapped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (value === null) {
      mapped[camelCase(key)] = undefined;
      continue;
    }
    if (DATE_KEYS.has(key) && typeof value === "string") {
      mapped[camelCase(key)] = new Date(value);
      continue;
    }
    mapped[camelCase(key)] = value;
  }

  return mapped;
}

// Runtime shape check for raw database rows, so a renamed or dropped column
// shows up as a logged mismatch in development instead of a silently
// undefined field on screen. One schema per table, matching the snake_case
// columns the generated types describe; extra columns are allowed to pass
// through. These are only asserted in development (see mappers.ts).

import { z } from "zod";

import type { TableName } from "./index";

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const ROW_SCHEMAS: Record<TableName, z.ZodTypeAny> = {
  building: z
    .object({
      id: z.number(),
      owner: z.string(),
      address: z.string(),
      bbl: nullableString,
      bin: nullableString,
      sqft: z.number(),
      is_affordable: z.boolean(),
      annual_emissions_tco2e: nullableNumber,
      uses_json: nullableString,
      ll97_covered: z.boolean().nullable(),
      provenance_json: nullableString,
      num_floors: nullableNumber,
      units_residential: nullableNumber,
      community_district: nullableNumber,
      energy_star_score: nullableNumber,
      compliance_plan_json: nullableString,
      created_at: z.string(),
    })
    .passthrough(),
  task: z
    .object({
      id: z.number(),
      owner: z.string(),
      building_id: nullableNumber,
      law_id: z.string(),
      kind: z.string(),
      title: z.string(),
      status: z.string(),
      deadline: z.string(),
      sla_breached: z.boolean(),
      fine_estimate_usd: nullableNumber,
      claimed_by: nullableNumber,
      intake_address: nullableString,
      created_at: z.string(),
    })
    .passthrough(),
  worker: z
    .object({
      id: z.number(),
      name: z.string(),
      status: z.string(),
      last_heartbeat: z.string(),
      current_task_id: nullableNumber,
      last_task_owner: nullableString,
    })
    .passthrough(),
  submission: z
    .object({
      id: z.number(),
      owner: z.string(),
      task_id: z.number(),
      worker_id: z.number(),
      body: z.string(),
      payload_json: nullableString,
      submitted_at: z.string(),
    })
    .passthrough(),
  approval: z
    .object({
      id: z.number(),
      owner: z.string(),
      task_id: z.number(),
      approved_by: z.string(),
      verdict: z.string(),
      note: z.string(),
      at: z.string(),
    })
    .passthrough(),
  settings: z
    .object({
      owner: z.string(),
      review_mode: z.string(),
    })
    .passthrough(),
  event: z
    .object({
      id: z.number(),
      owner: z.string(),
      kind: z.string(),
      payload: z.string(),
      task_id: nullableNumber,
      worker_id: nullableNumber,
      at: z.string(),
    })
    .passthrough(),
  vendor: z
    .object({
      id: z.number(),
      owner: z.string(),
      name: z.string(),
      company: z.string(),
      role_type: z.string(),
      email: z.string(),
      phone: z.string(),
      license_number: z.string(),
      license_type: z.string(),
      notes: z.string(),
      created_at: z.string(),
    })
    .passthrough(),
  obligation: z
    .object({
      id: z.number(),
      owner: z.string(),
      building_id: z.number(),
      law_id: z.string(),
      title: z.string(),
      status: z.string(),
      responsible_party: z.string(),
      vendor_id: nullableNumber,
      filing_reference_number: z.string(),
      notes: z.string(),
      due_date: nullableString,
      completed_at: nullableString,
      created_at: z.string(),
      updated_at: z.string(),
    })
    .passthrough(),
  evidence: z
    .object({
      id: z.number(),
      owner: z.string(),
      building_id: z.number(),
      obligation_id: z.number(),
      law_id: z.string(),
      file_name: z.string(),
      file_type: z.string(),
      file_url_or_key: z.string(),
      uploaded_by: z.string(),
      issuer: z.string(),
      filing_reference_number: z.string(),
      notes: z.string(),
      verification_status: z.string(),
      vendor_id: nullableNumber,
      document_date: nullableString,
      expiration_date: nullableString,
      uploaded_at: z.string(),
    })
    .passthrough(),
  binder_event: z
    .object({
      id: z.number(),
      owner: z.string(),
      building_id: z.number(),
      obligation_id: nullableNumber,
      law_id: z.string(),
      kind: z.string(),
      summary: z.string(),
      at: z.string(),
    })
    .passthrough(),
};

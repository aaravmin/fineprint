import { afterEach, describe, expect, test, vi } from "vitest";

import { mapRow } from "./mappers";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mapRow", () => {
  test("translates snake_case, dates, and null the way components expect", () => {
    const mapped = mapRow("worker", {
      id: 1,
      name: "atlas",
      status: "idle",
      last_heartbeat: "2026-01-01T00:00:00.000Z",
      current_task_id: null,
      last_task_owner: "user_a",
    }) as Record<string, unknown>;

    expect(mapped.currentTaskId).toBeUndefined();
    expect(mapped.lastTaskOwner).toBe("user_a");
    expect(mapped.lastHeartbeat).toBeInstanceOf(Date);
  });

  test("a well-formed row logs nothing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    mapRow("approval", {
      id: 1,
      owner: "user_a",
      task_id: 2,
      approved_by: "user_a",
      verdict: "approved",
      note: "",
      at: "2026-01-01T00:00:00.000Z",
    });

    expect(spy).not.toHaveBeenCalled();
  });

  test("a row missing a column is reported once in development", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    // vendor row with license_number renamed away — the drift this guards.
    const brokenVendor = {
      id: 1,
      owner: "user_a",
      name: "n",
      company: "c",
      role_type: "engineer",
      email: "e",
      phone: "p",
      license_type: "PE",
      notes: "",
      created_at: "2026-01-01T00:00:00.000Z",
    };

    mapRow("vendor", brokenVendor);
    mapRow("vendor", brokenVendor);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain("vendor");
  });
});

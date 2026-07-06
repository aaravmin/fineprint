import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseElevatorRows } from "../src/elevators.ts";

// Real DOB NOW elevator devices (Socrata e5aq-a4j2) for 900 Grand Concourse
// (BIN 2002802), recorded 2026-07-05. Four active elevators.
const rows = JSON.parse(
  readFileSync(new URL("./fixtures/elevators-2002802.json", import.meta.url), "utf8"),
);

describe("parseElevatorRows", () => {
  test("maps each device onto the normalized shape", () => {
    const devices = parseElevatorRows(rows);

    expect(devices).toHaveLength(rows.length);
    expect(devices[0].bin).toBe("2002802");
    expect(devices[0].deviceNumber).not.toBe("");
  });

  test("keeps the device type and status", () => {
    const devices = parseElevatorRows(rows);

    expect(devices.every(device => device.deviceType === "Elevator")).toBe(true);
    expect(devices.some(device => device.deviceStatus === "Active")).toBe(true);
  });
});

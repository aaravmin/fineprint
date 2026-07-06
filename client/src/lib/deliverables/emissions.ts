// The LL97 emissions position Fineprint prepares for a building — the numbers an
// owner takes to their Article 320 report in DOB NOW: BEAM (or to their RDP). All
// values come from public records and the deterministic engine; nothing is entered.

import type { Building } from "@/lib/data/types";
import { computePeriods } from "@/lib/engine";

import type { Deliverable, DeliverableSection, DeliverableStat } from "./types";

const tco2e = (value: number): string => `${Math.round(value).toLocaleString("en-US")} tCO2e`;
const usd0 = (value: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const ft2 = (value: number): string => `${value.toLocaleString("en-US")} ft²`;

function occupancy(building: Building): Array<{ group: string; sqft: number }> {
  if (!building.usesJson) {
    return [];
  }
  try {
    const parsed = JSON.parse(building.usesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function buildEmissionsDeliverable(building: Building, generatedAt: string): Deliverable {
  const periods = computePeriods(building);
  const current = periods?.[0] ?? null;
  const uses = occupancy(building);

  const identification: DeliverableSection = {
    heading: "Building",
    rows: [
      { label: "Address", value: building.address },
      { label: "Borough-Block-Lot (BBL)", value: building.bbl ?? "—" },
      { label: "Building Identification Number (BIN)", value: building.bin ?? "—" },
      { label: "Gross floor area", value: ft2(building.sqft) },
      {
        label: "Occupancy",
        value: uses.length > 0 ? uses.map((use) => `${use.group} (${ft2(use.sqft)})`).join("; ") : "—",
      },
    ],
  };

  const stats: DeliverableStat[] = [];
  const sections: DeliverableSection[] = [identification];

  if (periods && current) {
    stats.push(
      current.compliant
        ? { label: "Status", value: "Under the cap", tone: "ok" }
        : { label: "Status", value: "Over the cap", tone: "bad" },
    );
    if (!current.compliant) {
      stats.push({ label: "Over cap", value: tco2e(current.overageTco2e), tone: "bad" });
      stats.push({ label: "Penalty", value: `${usd0(current.annualFineUsd)}/yr`, tone: "bad" });
    }
    stats.push({
      label: "Pathway",
      value: current.pathway === "article321" ? "Article 321" : "Article 320",
      tone: "muted",
    });

    sections.push({
      heading: "Emissions against the limit",
      table: {
        columns: ["Compliance period", "Limit", "Emissions", "Over cap", "Penalty / yr", "Status"],
        rows: periods.map((period) => [
          period.period,
          tco2e(period.emissionsLimitTco2e),
          tco2e(period.actualEmissionsTco2e),
          period.overageTco2e > 0 ? tco2e(period.overageTco2e) : "—",
          period.annualFineUsd > 0 ? usd0(period.annualFineUsd) : "—",
          period.compliant ? "Compliant" : "Over",
        ]),
        note: "Limit = each occupancy area × its emissions coefficient (Admin Code 28-320.3). Penalty = $268 per tCO2e over the limit (1 RCNY 103-14(h)).",
      },
    });
  } else {
    stats.push({ label: "Status", value: "Awaiting benchmarking", tone: "muted" });
    sections.push({
      heading: "Emissions against the limit",
      note: "This building isn't benchmarked yet, so its emissions position can't be computed. Once annual energy data is on file, the LL97 projection appears here.",
    });
  }

  return {
    kind: "emissions",
    title: "LL97 emissions position",
    purpose:
      "For your annual Article 320 emissions report in DOB NOW: BEAM, and for your Registered Design Professional.",
    building: { address: building.address, bbl: building.bbl ?? null, bin: building.bin ?? null, sqft: building.sqft },
    stats,
    sections,
    notes: [
      "Prepared by Fineprint from NYC public records and the LL97 emissions model. Figures are estimates for planning; your RDP verifies and attests the filed report.",
      "Gross floor area for LL97 differs from the Dept. of Finance gross square footage — confirm the GFA your RDP will file.",
    ],
    generatedAt,
  };
}

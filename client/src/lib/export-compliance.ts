// Export the compliance view two ways with zero dependencies: a CSV download of
// the numbers, and a print/Save-as-PDF of the styled report (window.print plus
// the @media print rules in globals.css). Both run entirely in the browser.

import type { Building } from "@/lib/db/types";
import type { FundedPlan } from "@/lib/engine";
import { EXPORT_SCHEMA_VERSION } from "@/lib/output/exportEnvelope";

export interface LawExposureRow {
  short: string;
  name: string;
  status: string;
  exposureUsd: number | undefined;
  // Past the statutory deadline or SLA-breached — the exposure is live, not future.
  overdue: boolean;
}

// One CSV cell: quote anything with a comma, quote, or newline; double any
// embedded quotes. Numbers and plain strings pass through untouched.
function cell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function row(cells: Array<string | number>): string {
  return cells.map(cell).join(",");
}

export function buildComplianceCsv(building: Building, plan: FundedPlan | null, lawRows: LawExposureRow[]): string {
  const lines: string[] = [];

  lines.push(row(["Fineprint compliance export"]));
  lines.push(row(["Schema version", EXPORT_SCHEMA_VERSION]));
  lines.push(row(["Generated at", new Date().toISOString()]));
  lines.push(row(["Address", building.address]));
  lines.push(row(["BBL", building.bbl ?? ""]));
  lines.push(row(["BIN", building.bin ?? ""]));
  lines.push(row(["Gross floor area (sqft)", building.sqft]));
  lines.push("");

  if (plan) {
    lines.push(row(["Baseline emissions (tCO2e/yr)", plan.baselineEmissionsTco2e]));
    lines.push(row(["Projected emissions (tCO2e/yr)", plan.projectedEmissionsTco2e]));
    lines.push(row(["Capex committed (USD)", plan.capexUsd]));
    lines.push("");

    lines.push(row(["LL97 fine projection"]));
    lines.push(row(["Period", "Emissions limit (tCO2e)", "Annual fine (USD)", "Compliant"]));
    for (const result of plan.results) {
      lines.push(
        row([
          result.period,
          result.emissionsLimitTco2e,
          Math.round(result.annualFineUsd),
          result.compliant ? "yes" : "no",
        ]),
      );
    }
    lines.push("");

    lines.push(row(["Funded measures"]));
    lines.push(row(["Measure", "Full cost (USD)", "Funded (USD)", "% funded", "Cut (tCO2e/yr)"]));
    for (const measure of plan.measures) {
      lines.push(
        row([
          measure.name,
          Math.round(measure.fullCostUsd),
          Math.round(measure.fundedUsd),
          Math.round(measure.fundedFraction * 100),
          measure.emissionsCutTco2e,
        ]),
      );
    }
    lines.push("");
  }

  lines.push(row(["Law exposure"]));
  lines.push(row(["Law", "Name", "Status", "Annual exposure (USD)", "Overdue"]));
  for (const law of lawRows) {
    lines.push(
      row([
        law.short,
        law.name,
        law.status,
        law.exposureUsd !== undefined ? Math.round(law.exposureUsd) : "tracked",
        law.overdue ? "yes" : "no",
      ]),
    );
  }

  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// A filesystem-safe slug from a building address, for the download filename.
export function slugForBuilding(building: Building): string {
  return (
    building.address
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "building"
  );
}

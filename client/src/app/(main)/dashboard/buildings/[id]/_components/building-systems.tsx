"use client";

import {
  categoryForSystem,
  // biome-ignore lint/correctness/noUndeclaredDependencies: fineprint-engine is a tsconfig path alias to ../engine/src, resolved by TS and Turbopack, not an npm package.
} from "fineprint-engine";

import { InfoHint } from "@/components/dashboard/InfoHint";
import { SectionCard } from "@/components/dashboard/SectionCard";
import {
  type BuildingSystems as BuildingSystemsData,
  SYSTEM_DISPLAY_NAME,
  SYSTEM_ORDER,
  type SystemAssessment,
  type SystemKey,
  sourceDisplayName,
} from "@/lib/compliance/plan";
import { categoryIcon } from "@/lib/retrofit/categoryRegistry";

// The infrastructure dossier: what each of the eight systems is, inferred from
// public NYC records, so the retrofit plan below can speak to this building
// rather than a generic one.
export function BuildingSystems({ systems }: { systems: BuildingSystemsData | null }) {
  if (!systems || systems.systems.length === 0) {
    return (
      <SectionCard title="Building systems">
        <p className="py-4 text-sm text-muted-foreground">No system records inferred yet.</p>
      </SectionCard>
    );
  }

  const byKey = new Map(systems.systems.map((system) => [system.system, system]));
  const sourceNames = systems.generatedFrom.map(sourceDisplayName);

  return (
    <SectionCard
      title="Building systems"
      sub={
        <span className="inline-flex items-center gap-1">
          Inferred from {systems.generatedFrom.length} NYC record sources
          {sourceNames.length > 0 ? <InfoHint text={sourceNames.join(", ")} label="Record sources" /> : null}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2.5 @md/main:grid-cols-4">
        {SYSTEM_ORDER.map((key) => {
          const system = byKey.get(key);
          if (!system) {
            return <SystemTile key={key} systemKey={key} assessment={null} />;
          }
          return <SystemTile key={key} systemKey={key} assessment={system} />;
        })}
      </div>
    </SectionCard>
  );
}

function humanizeCondition(condition: string): string {
  return condition.replace(/_/g, " ");
}

function primaryType(headline: string): string {
  const beforeInstalled = headline.split(/,?\s*installed/i)[0];
  return beforeInstalled.split(",")[0].trim();
}

function emissionsShareLabel(share: number): string {
  const percent = share * 100;
  if (percent < 1) {
    return "<1%";
  }
  return `${Math.round(percent)}%`;
}

// A 2% floor keeps a real-but-tiny contribution from rendering as an invisible
// sliver; the label still prints the true share, so the floor never misleads.
function emissionsBarWidth(share: number): number {
  const percent = share * 100;
  return Math.min(100, Math.max(2, percent));
}

function SystemTile({ systemKey, assessment }: { systemKey: SystemKey; assessment: SystemAssessment | null }) {
  const Icon = categoryIcon(categoryForSystem(systemKey));
  const unknown = !assessment || assessment.presence === "unknown";

  const subParts: string[] = [];
  if (assessment?.vintageYear) {
    subParts.push(`installed ~${assessment.vintageYear}`);
  }
  if (assessment && assessment.condition !== "unknown") {
    subParts.push(humanizeCondition(assessment.condition));
  }

  const sources = assessment
    ? Array.from(new Set(assessment.evidence.map((reference) => sourceDisplayName(reference.dataset))))
    : [];
  const confidenceLabel = assessment?.confidence === "medium" ? "med" : (assessment?.confidence ?? "");

  const evidenceParts = [`Sources: ${sources.join(", ")}`];
  if (assessment?.estAnnualTco2e != null) {
    evidenceParts.push(`~${Math.round(assessment.estAnnualTco2e).toLocaleString()} tCO2e/yr`);
  }
  const evidenceHint = evidenceParts.join(" - ");

  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-xs">{SYSTEM_DISPLAY_NAME[systemKey]}</span>
      </div>

      {unknown ? (
        <>
          <p className="mt-1.5 text-sm text-muted-foreground">Unknown</p>
          <p className="text-xs text-muted-foreground">No records found</p>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-sm font-medium">{primaryType(assessment.headline)}</p>
          {subParts.length > 0 ? <p className="text-xs text-muted-foreground">{subParts.join(" - ")}</p> : null}
          {assessment.shareOfEmissions != null && assessment.shareOfEmissions > 0 ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground/60"
                  style={{ width: `${emissionsBarWidth(assessment.shareOfEmissions)}%` }}
                />
              </div>
              <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                {emissionsShareLabel(assessment.shareOfEmissions)} of emissions
              </span>
            </div>
          ) : null}
          <div className="mt-1.5 flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {confidenceLabel} confidence
            </span>
            {sources.length > 0 ? <InfoHint text={evidenceHint} label="Evidence sources" /> : null}
          </div>
        </>
      )}
    </div>
  );
}

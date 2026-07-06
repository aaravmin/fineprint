"use client";

import { useState } from "react";

import { ChevronDown } from "lucide-react";

import {
  type CategoryDef,
  categoryById,
  categoryForSystem,
  enabledCategories,
  type RetrofitCategory,
  // biome-ignore lint/correctness/noUndeclaredDependencies: fineprint-engine is a tsconfig path alias to ../engine/src, resolved by TS and Turbopack, not an npm package.
} from "fineprint-engine";

import { SectionCard } from "@/components/dashboard/SectionCard";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { dedash, type PersonalizedMeasure } from "@/lib/compliance/plan";
import { type FundedPlan, fmtTco2e } from "@/lib/engine";
import { compactUsd } from "@/lib/format";
import { lawShortName } from "@/lib/laws/lawRegistry";
import { categoryIcon } from "@/lib/retrofit/categoryRegistry";
import { cn } from "@/lib/utils";

type FundedMeasure = FundedPlan["measures"][number];

// A plan row is either a live-funded measure (has a slider or an include toggle
// wired to the projection) or a read-only recommendation the browser engine
// doesn't model.
type FundedItem = {
  kind: "funded";
  engineMeasure: FundedMeasure;
  name: string;
  why: string;
  topPick: boolean;
};
type ReadOnlyItem = {
  kind: "readonly";
  measure: PersonalizedMeasure;
  topPick: boolean;
};
type PlanItem = FundedItem | ReadOnlyItem;

type CategoryGroup = { category: CategoryDef; items: PlanItem[] };

// Owners fund in whole $500 steps - anything finer is noise on a retrofit quote.
const STEP = 500;

function snap(value: number, max: number): number {
  const snapped = Math.round(value / STEP) * STEP;
  return Math.min(Math.max(snapped, 0), max);
}

function rankValue(measure: PersonalizedMeasure): number {
  return measure.costPerTco2eAvoided ?? Number.POSITIVE_INFINITY;
}

function itemCategory(item: PlanItem): RetrofitCategory {
  if (item.kind === "funded") {
    return item.engineMeasure.category ?? categoryForSystem(item.engineMeasure.targetSystem ?? "");
  }
  return item.measure.category ?? categoryForSystem(item.measure.targetSystem);
}

// A cost-only line: either a readiness/enabling measure that cuts no emissions
// on its own (electrical service upgrade), or a measure with no cost to move a
// slider along. Both read as an include/exclude toggle, not a dead slider.
function isToggleMeasure(engineMeasure: FundedMeasure): boolean {
  return engineMeasure.reducesEmissions === false || engineMeasure.fullCostUsd === 0;
}

// Bucket the plan rows into categories, in the taxonomy's display order. A
// category renders only when it holds at least one row; measures whose category
// falls outside the enabled set still get a home rather than vanishing.
function buildGroups(items: PlanItem[]): CategoryGroup[] {
  const byCategory = new Map<RetrofitCategory, PlanItem[]>();
  for (const item of items) {
    const category = itemCategory(item);
    byCategory.set(category, [...(byCategory.get(category) ?? []), item]);
  }

  const ordered: CategoryGroup[] = [];
  const placed = new Set<RetrofitCategory>();

  for (const category of enabledCategories()) {
    const group = byCategory.get(category.id);
    if (group && group.length > 0) {
      ordered.push({ category, items: group });
      placed.add(category.id);
    }
  }

  for (const [categoryId, group] of byCategory) {
    if (!placed.has(categoryId) && group.length > 0) {
      const definition = categoryById(categoryId) ?? {
        id: categoryId,
        displayName: categoryId,
        systemKeys: [],
        sortOrder: 999,
        enabled: false,
      };
      ordered.push({ category: definition, items: group });
    }
  }

  return ordered;
}

// The personalized retrofit list is the source of truth for what to do; measures
// the browser engine also models get a live funding control that drives the fine
// projection above, and the rest render as read-only recommendations. Everything
// groups under the retrofit category an owner reasons about (heating, lighting...).
export function RetrofitPlan({
  personalizedMeasures,
  fundedPlan,
  finesAvoidedUsd,
  funding,
  onFundingChange,
  onResetOptimizer,
}: {
  personalizedMeasures: PersonalizedMeasure[];
  fundedPlan: FundedPlan | null;
  finesAvoidedUsd: number | null;
  funding: Record<string, number>;
  onFundingChange: (next: Record<string, number>) => void;
  onResetOptimizer?: () => void;
}) {
  const engineById = new Map((fundedPlan?.measures ?? []).map((measure) => [measure.id, measure]));

  const resetAction = onResetOptimizer ? (
    <Button type="button" variant="outline" size="sm" onClick={onResetOptimizer}>
      Optimizer pick
    </Button>
  ) : undefined;

  // Fallback: no personalized catalog on this building. Group the engine's
  // generic funding list when it exists, otherwise there is nothing to plan yet.
  if (personalizedMeasures.length === 0) {
    const genericItems: PlanItem[] = (fundedPlan?.measures ?? []).map((measure) => ({
      kind: "funded",
      engineMeasure: measure,
      name: measure.name,
      why: measure.basis,
      topPick: false,
    }));

    return (
      <SectionCard title="Retrofit plan" sub="Generic estimates - systems dossier pending." action={resetAction}>
        {fundedPlan && genericItems.length > 0 ? (
          <GroupedPlan groups={buildGroups(genericItems)} funding={funding} onFundingChange={onFundingChange} />
        ) : (
          <p className="py-4 text-sm text-muted-foreground">No retrofit measures modeled yet.</p>
        )}

        {fundedPlan ? <PlanBottomLine fundedPlan={fundedPlan} finesAvoidedUsd={finesAvoidedUsd} /> : null}
      </SectionCard>
    );
  }

  const mainMeasures = personalizedMeasures
    .filter((measure) => measure.applicability === "recommended" || measure.applicability === "applicable")
    .sort((a, b) => rankValue(a) - rankValue(b));

  const topPickId = mainMeasures[0]?.id ?? null;

  const items: PlanItem[] = mainMeasures.map((measure) => {
    const engineMeasure = engineById.get(measure.id);
    const topPick = measure.id === topPickId;

    if (engineMeasure) {
      return { kind: "funded", engineMeasure, name: measure.name, why: measure.why, topPick };
    }
    return { kind: "readonly", measure, topPick };
  });

  const notForBuilding = personalizedMeasures.filter(
    (measure) => measure.applicability === "already_done" || measure.applicability === "not_applicable",
  );

  return (
    <SectionCard title="Retrofit plan" sub="Fund a measure to watch the projection above fall." action={resetAction}>
      <GroupedPlan groups={buildGroups(items)} funding={funding} onFundingChange={onFundingChange} />

      {notForBuilding.length > 0 ? (
        <Collapsible className="mt-3 border-t pt-3">
          <CollapsibleTrigger className="group flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground">
            <span>Not for this building ({notForBuilding.length})</span>
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {notForBuilding.map((measure) => (
              <div key={measure.id} className="text-xs">
                <p className="font-medium text-muted-foreground">{measure.name}</p>
                <p className="text-muted-foreground/80">{dedash(measure.applicabilityReason)}</p>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {fundedPlan ? <PlanBottomLine fundedPlan={fundedPlan} finesAvoidedUsd={finesAvoidedUsd} /> : null}
    </SectionCard>
  );
}

function GroupedPlan({
  groups,
  funding,
  onFundingChange,
}: {
  groups: CategoryGroup[];
  funding: Record<string, number>;
  onFundingChange: (next: Record<string, number>) => void;
}) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <CategorySection
          key={group.category.id}
          category={group.category}
          items={group.items}
          funding={funding}
          onFundingChange={onFundingChange}
        />
      ))}
    </div>
  );
}

function CategorySection({
  category,
  items,
  funding,
  onFundingChange,
}: {
  category: CategoryDef;
  items: PlanItem[];
  funding: Record<string, number>;
  onFundingChange: (next: Record<string, number>) => void;
}) {
  const fundedItems = items.filter((item): item is FundedItem => item.kind === "funded");

  const subtotalFullCost = fundedItems.reduce((sum, item) => sum + item.engineMeasure.fullCostUsd, 0);
  const subtotalCommitted = fundedItems.reduce((sum, item) => sum + item.engineMeasure.fundedUsd, 0);
  const subtotalCut = fundedItems.reduce((sum, item) => sum + item.engineMeasure.emissionsCutTco2e, 0);

  const setMeasure = (id: string, value: number, max: number) => {
    onFundingChange({ ...funding, [id]: snap(value, max) });
  };

  // Funding one member of an exclusive group is choosing it: its siblings drop
  // to zero in the same update so the projection reflects a single alternative.
  const chooseMeasure = (id: string, value: number, max: number, siblingIds: string[]) => {
    const next = { ...funding };
    for (const siblingId of siblingIds) {
      next[siblingId] = 0;
    }
    next[id] = snap(value, max);
    onFundingChange(next);
  };

  const membersByGroup = new Map<string, FundedItem[]>();
  for (const item of fundedItems) {
    const group = item.engineMeasure.exclusiveGroup;
    if (group) {
      membersByGroup.set(group, [...(membersByGroup.get(group) ?? []), item]);
    }
  }

  const Icon = categoryIcon(category.id);
  const renderedGroups = new Set<string>();

  const renderFundedRow = (item: FundedItem, siblingIds: string[]) => {
    const onChange = (id: string, value: number, max: number) => {
      if (siblingIds.length > 0 && value > 0) {
        chooseMeasure(id, value, max, siblingIds);
      } else {
        setMeasure(id, value, max);
      }
    };

    if (isToggleMeasure(item.engineMeasure)) {
      return (
        <ToggleMeasureRow
          key={item.engineMeasure.id}
          name={item.name}
          why={item.why}
          engineMeasure={item.engineMeasure}
          topPick={item.topPick}
          onChange={onChange}
        />
      );
    }

    return (
      <FundedMeasureRow
        key={item.engineMeasure.id}
        name={item.name}
        why={item.why}
        engineMeasure={item.engineMeasure}
        topPick={item.topPick}
        onChange={onChange}
      />
    );
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{category.displayName}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs tabular-nums">
          <span className="text-muted-foreground">
            {compactUsd(subtotalCommitted)} of {compactUsd(subtotalFullCost)}
          </span>
          {subtotalCut > 0 ? <span className="font-medium text-success">-{fmtTco2e(subtotalCut)}/yr</span> : null}
        </div>
      </div>

      {items.map((item) => {
        if (item.kind === "readonly") {
          return <ReadOnlyMeasureRow key={item.measure.id} measure={item.measure} topPick={item.topPick} />;
        }

        const group = item.engineMeasure.exclusiveGroup;
        if (group) {
          if (renderedGroups.has(group)) {
            return null;
          }
          renderedGroups.add(group);

          const members = membersByGroup.get(group) ?? [];
          const memberIds = members.map((member) => member.engineMeasure.id);

          return (
            <div key={`group-${group}`} className="space-y-2 rounded-xl border border-dashed px-2.5 py-2.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Choose one</span>
              {members.map((member) => {
                const siblingIds = memberIds.filter((id) => id !== member.engineMeasure.id);
                return renderFundedRow(member, siblingIds);
              })}
            </div>
          );
        }

        return renderFundedRow(item, []);
      })}
    </div>
  );
}

function MeasureHeader({
  name,
  why,
  topPick,
  right,
}: {
  name: string;
  why: string;
  topPick?: boolean;
  right: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          {topPick ? (
            <Badge variant="secondary" className="text-[10px]">
              Best value
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={dedash(why)}>
          {dedash(why)}
        </p>
      </div>
      <div className="shrink-0 text-right text-xs">{right}</div>
    </div>
  );
}

function FundedMeasureRow({
  name,
  why,
  engineMeasure,
  topPick,
  onChange,
}: {
  name: string;
  why: string;
  engineMeasure: FundedMeasure;
  topPick?: boolean;
  onChange: (id: string, value: number, max: number) => void;
}) {
  const laws = engineMeasure.satisfiesLaws ?? [];

  // While the dollar field is focused, hold the raw typed amount so a small
  // entry like "7" isn't snapped to the $500 grid mid-keystroke and erased.
  // Snapping happens on blur and Enter; the slider still snaps live.
  const [draftUsd, setDraftUsd] = useState<number | null>(null);
  const displayUsd = draftUsd ?? engineMeasure.fundedUsd;

  const commitDraft = () => {
    if (draftUsd !== null) {
      onChange(engineMeasure.id, draftUsd, engineMeasure.fullCostUsd);
      setDraftUsd(null);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border bg-card px-4 py-3">
      <MeasureHeader
        name={name}
        why={why}
        topPick={topPick}
        right={
          <>
            <p className="tabular-nums text-muted-foreground">{compactUsd(engineMeasure.fullCostUsd)}</p>
            <p className={engineMeasure.emissionsCutTco2e > 0 ? "font-medium text-success" : "text-muted-foreground"}>
              -{fmtTco2e(engineMeasure.emissionsCutTco2e)}/yr
            </p>
          </>
        }
      />

      {laws.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {laws.map((lawId) => (
            <Badge key={lawId} variant="outline" className="text-[10px]">
              also {lawShortName(lawId)}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Slider
          value={[engineMeasure.fundedUsd]}
          min={0}
          max={engineMeasure.fullCostUsd}
          step={STEP}
          onValueChange={(value: number[]) => onChange(engineMeasure.id, value[0], engineMeasure.fullCostUsd)}
          className="flex-1"
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">$</span>
          <Input
            type="text"
            inputMode="numeric"
            value={displayUsd.toLocaleString("en-US")}
            onChange={(event) => {
              const digits = Number(event.target.value.replace(/[^0-9]/g, ""));
              setDraftUsd(Math.min(Math.max(digits, 0), engineMeasure.fullCostUsd));
            }}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitDraft();
              }
            }}
            className="w-28 text-right tabular-nums"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground tabular-nums">
        {Math.round(engineMeasure.fundedFraction * 100)}% funded
      </p>
    </div>
  );
}

// A cost-only or zero-slider measure: include it (fund the whole cost at once)
// or leave it out. A $0 measure has nothing to fund, so its toggle is fixed on
// and reads as a free inclusion rather than a control.
function ToggleMeasureRow({
  name,
  why,
  engineMeasure,
  topPick,
  onChange,
}: {
  name: string;
  why: string;
  engineMeasure: FundedMeasure;
  topPick?: boolean;
  onChange: (id: string, value: number, max: number) => void;
}) {
  const isFree = engineMeasure.fullCostUsd === 0;
  const included = isFree || engineMeasure.fundedUsd >= engineMeasure.fullCostUsd;

  const rightLabel = (() => {
    if (isFree) {
      return "included";
    }
    if (engineMeasure.reducesEmissions === false) {
      return "readiness cost";
    }
    return engineMeasure.emissionsCutTco2e > 0 ? `-${fmtTco2e(engineMeasure.emissionsCutTco2e)}/yr` : "no direct cut";
  })();

  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Checkbox
            checked={included}
            disabled={isFree}
            onCheckedChange={(next: boolean | "indeterminate") =>
              onChange(engineMeasure.id, next === true ? engineMeasure.fullCostUsd : 0, engineMeasure.fullCostUsd)
            }
            className="mt-0.5"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{name}</span>
              {topPick ? (
                <Badge variant="secondary" className="text-[10px]">
                  Best value
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={dedash(why)}>
              {dedash(why)}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right text-xs">
          <p className="tabular-nums text-muted-foreground">{compactUsd(engineMeasure.fullCostUsd)}</p>
          <p className="text-muted-foreground">{rightLabel}</p>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyMeasureRow({ measure, topPick }: { measure: PersonalizedMeasure; topPick?: boolean }) {
  return (
    <div className="space-y-1.5 rounded-xl border bg-card px-4 py-3">
      <MeasureHeader
        name={measure.name}
        why={measure.why}
        topPick={topPick}
        right={
          <>
            <p className="tabular-nums text-muted-foreground">
              {measure.capexUsd !== null ? compactUsd(measure.capexUsd) : "-"}
            </p>
            {measure.estReductionTco2e !== null ? (
              <p className="text-success">-{fmtTco2e(measure.estReductionTco2e)}/yr</p>
            ) : null}
          </>
        }
      />
      <StatusPill tone="muted">Estimate - outside the live model</StatusPill>
    </div>
  );
}

// The card's bottom line: the three numbers the funding controls above resolve
// to, so the plan reads as a decision and not just a row of sliders.
function PlanBottomLine({ fundedPlan, finesAvoidedUsd }: { fundedPlan: FundedPlan; finesAvoidedUsd: number | null }) {
  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t pt-3">
      <PlanStat label="Capex committed" value={compactUsd(fundedPlan.capexUsd)} />
      <PlanStat label="Projected emissions" value={`${fmtTco2e(fundedPlan.projectedEmissionsTco2e)}/yr`} />
      <PlanStat
        label="Fines avoided through 2039"
        value={finesAvoidedUsd === null ? "-" : compactUsd(finesAvoidedUsd)}
        valueClassName="text-success"
      />
    </div>
  );
}

function PlanStat({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-medium tabular-nums", valueClassName)}>{value}</span>
    </div>
  );
}

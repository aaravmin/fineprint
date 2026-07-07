"use client";

import { toast } from "sonner";

import { TRACKED_CATEGORIES } from "@/lib/categories/trackedCategories";
import { useTrackedCategories } from "@/lib/data/hooks";
import { useToggleCategory } from "@/lib/data/mutations";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export function TrackingClient() {
  const { isTracked } = useTrackedCategories();
  const toggleCategory = useToggleCategory();

  async function setTracked(category: string, tracked: boolean) {
    try {
      await toggleCategory(category, tracked);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update tracking");
    }
  }

  return (
    <div className="@container/main flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Tracking</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tracking a category tailors your dashboard and tickets to it. Untracked categories stay
          available inside each building's full breakdown.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 @2xl/main:grid-cols-2 @5xl/main:grid-cols-3">
        {TRACKED_CATEGORIES.map((category) => {
          const Icon = category.icon;
          const checked = isTracked(category.id);

          return (
            <Card key={category.id}>
              <CardHeader className="grid-cols-[auto_1fr_auto] items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4.5" />
                </span>
                <CardTitle className="text-base">{category.label}</CardTitle>
                <Switch
                  checked={checked}
                  disabled={!category.toggleable}
                  onCheckedChange={(next: boolean) => setTracked(category.id, next)}
                  aria-label={`Track ${category.label}`}
                />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{category.blurb}</p>
                {!category.toggleable ? (
                  <p className="mt-2 text-xs font-medium text-muted-foreground/70">Always on</p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

import { useTable } from "spacetimedb/react";

import { Button } from "@/components/ui/button";
import { EmptyFolder } from "@/components/ui/empty-folder";
import { tables } from "@/module_bindings/index";

import { ComplianceDashboard } from "../[id]/_components/compliance-dashboard";

// The Buildings tab opened on its own: pick any building from the selector and
// its full compliance plan renders below. (Clicking a row from the Portfolio
// deep-links straight to that building's /dashboard/buildings/[id] page.)
export function BuildingsClient() {
  const [buildings] = useTable(tables.building);
  const [selectedId, setSelectedId] = useState<bigint | null>(null);

  const sorted = [...buildings].sort((a, b) => a.address.localeCompare(b.address));

  if (sorted.length === 0) {
    return (
      <div className="@container/main flex flex-col gap-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Buildings</h1>
        <EmptyFolder
          title="No buildings yet"
          description="Add an address from the Portfolio to start a compliance plan."
        />
      </div>
    );
  }

  const selected = sorted.find(building => building.id === selectedId) ?? sorted[0];

  return (
    <div className="@container/main flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight print-hide">
        Buildings
      </h1>

      <div className="flex flex-wrap gap-1.5 print-hide">
        {sorted.map(building => (
          <Button
            key={String(building.id)}
            type="button"
            size="sm"
            variant={selected.id === building.id ? "default" : "outline"}
            onClick={() => setSelectedId(building.id)}
          >
            {building.address}
          </Button>
        ))}
      </div>

      <ComplianceDashboard key={String(selected.id)} building={selected} />
    </div>
  );
}

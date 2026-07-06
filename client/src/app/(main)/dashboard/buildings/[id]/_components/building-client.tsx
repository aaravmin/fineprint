"use client";

import Link from "next/link";

import { ArrowLeft } from "lucide-react";
import { useBuildings } from "@/lib/data/hooks";

import { ComplianceDashboard } from "./compliance-dashboard";

interface Props {
  buildingId: bigint;
}

export function BuildingClient({ buildingId }: Props) {
  const buildings = useBuildings();

  const building = buildings.find((candidate) => candidate.id === buildingId);
  if (!building) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        Building not found.
        <Link href="/dashboard/buildings" className="inline-flex items-center gap-1 underline hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back to buildings
        </Link>
      </div>
    );
  }

  return <ComplianceDashboard key={String(building.id)} building={building} />;
}

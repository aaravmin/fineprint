"use client";

import Link from "next/link";

import { ArrowLeft } from "lucide-react";
import { useTable } from "spacetimedb/react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { tables } from "@/module_bindings/index";

import { ComplianceDashboard } from "./compliance-dashboard";

interface Props {
  buildingId: bigint;
}

export function BuildingClient({ buildingId }: Props) {
  const [buildings] = useTable(tables.building);

  const building = buildings.find(b => b.id === buildingId);
  if (!building) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        Building not found.
        <Link
          href="/dashboard/portfolio"
          className="inline-flex items-center gap-1 underline hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to portfolio
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Breadcrumb className="print-hide">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/portfolio">Portfolio</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{building.address}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <ComplianceDashboard key={String(building.id)} building={building} />
    </div>
  );
}

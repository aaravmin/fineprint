"use client";

import { usePathname } from "next/navigation";

// The current page name in the header, left of the controls. The building detail
// page reads "Buildings" here - its own h1 carries the address, so the header
// stays a stable section label rather than echoing the title.
const SECTION_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/dashboard/portfolio", title: "Overview" },
  { prefix: "/dashboard/buildings", title: "Buildings" },
  { prefix: "/dashboard/tasks", title: "Tasks" },
  { prefix: "/dashboard/agents", title: "Agents" },
  { prefix: "/dashboard/activity", title: "Activity" },
];

function titleForPath(pathname: string): string {
  const match = SECTION_TITLES.find((entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`));
  return match?.title ?? "Dashboard";
}

export function HeaderTitle() {
  const pathname = usePathname();

  return <span className="text-sm font-medium">{titleForPath(pathname)}</span>;
}

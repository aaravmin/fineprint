import {
  Activity,
  Building2,
  ClipboardList,
  LayoutDashboard,
  type LucideIcon,
  SlidersHorizontal,
} from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Compliance",
    items: [
      {
        title: "Overview",
        url: "/dashboard/portfolio",
        icon: LayoutDashboard,
      },
      {
        title: "Buildings",
        url: "/dashboard/buildings",
        icon: Building2,
      },
    ],
  },
  {
    id: 2,
    label: "Operations",
    items: [
      {
        title: "Tasks",
        url: "/dashboard/tasks",
        icon: ClipboardList,
      },
      {
        title: "Tracking",
        url: "/dashboard/tracking",
        icon: SlidersHorizontal,
      },
      {
        title: "Activity",
        url: "/dashboard/activity",
        icon: Activity,
      },
    ],
  },
];

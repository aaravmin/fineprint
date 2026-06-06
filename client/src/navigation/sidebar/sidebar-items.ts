import {
  Activity,
  Bot,
  Building2,
  type LucideIcon,
  LayoutDashboard,
  ClipboardList,
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
        title: "Portfolio",
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
        title: "Task Queue",
        url: "/dashboard/tasks",
        icon: ClipboardList,
      },
      {
        title: "Agents",
        url: "/dashboard/agents",
        icon: Bot,
      },
      {
        title: "Activity",
        url: "/dashboard/activity",
        icon: Activity,
      },
    ],
  },
];

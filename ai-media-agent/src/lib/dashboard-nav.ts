import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  PlusCircle,
  Layers,
  Clapperboard,
  Send,
  Palette,
  Settings,
} from "lucide-react";

export interface DashboardNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 尚未實作完整功能的頁面，第一階段先顯示「即將推出」。 */
  comingSoon?: boolean;
}

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { href: "/dashboard", label: "總覽", icon: LayoutDashboard },
  { href: "/dashboard/create", label: "新增內容", icon: PlusCircle },
  { href: "/dashboard/content", label: "內容中心", icon: Layers, comingSoon: true },
  { href: "/dashboard/editing", label: "AI 剪輯", icon: Clapperboard, comingSoon: true },
  { href: "/dashboard/publish", label: "發布中心", icon: Send, comingSoon: true },
  { href: "/dashboard/brand", label: "品牌設定", icon: Palette, comingSoon: true },
  { href: "/dashboard/settings", label: "帳號設定", icon: Settings, comingSoon: true },
];

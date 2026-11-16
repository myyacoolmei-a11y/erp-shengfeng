/** ERP product branding for the independent GongWuTong system. */
export const APP_BRAND = {
  nameZh: "工務通 ERP",
  nameEn: "GongWuTong HVAC Operations ERP",
  brandEn: "GongWuTong",
  logoAlt: "工務通",
  dashboardSubtitleZh: "系統總覽",
  pwaName: "工務通 ERP",
  pwaShortName: "工務通",
  themeColor: "#334155",
  backgroundColor: "#ffffff",
} as const;

export function browserTitle(page?: string): string {
  return page ? `${page} · ${APP_BRAND.nameZh}` : APP_BRAND.nameZh;
}

/** ERP product branding — not the legal entity name (晟風工程有限公司). */
export const APP_BRAND = {
  nameZh: "晟風空調工程管理助手 ERP",
  nameEn: "Cheng Feng HVAC Management Assistant ERP",
  brandEn: "Cheng Feng",
  logoAlt: "晟風空調",
  dashboardSubtitleZh: "系統總覽",
  /** PWA install name (home screen) */
  pwaName: "晟風工程管理助手",
  pwaShortName: "晟風 ERP",
  themeColor: "#334155",
  backgroundColor: "#ffffff",
} as const;

export function browserTitle(page?: string): string {
  return page ? `${page} · ${APP_BRAND.nameZh}` : APP_BRAND.nameZh;
}

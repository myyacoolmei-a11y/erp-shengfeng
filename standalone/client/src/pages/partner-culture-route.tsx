import { useAuth, hasRole, userHasFeature } from "@/contexts/auth-context";
import PartnerHome from "@/pages/partner-home";
import PartnerCulturePage from "@/pages/partner-culture";

/** 工程師瀏覽、行政／老闆編輯 — 同一路由不同元件（不以誤推的 role 擋行政） */
export default function PartnerCultureRoute() {
  const { user } = useAuth();
  const isManager =
    hasRole(user, "super_admin", "owner", "admin") ||
    (userHasFeature(user, "dispatch_orders") && userHasFeature(user, "customers"));
  if (isManager) {
    return <PartnerCulturePage />;
  }
  return <PartnerHome />;
}

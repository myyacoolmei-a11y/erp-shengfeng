import { useAuth, hasRole } from "@/contexts/auth-context";
import PartnerHome from "@/pages/partner-home";
import PartnerCulturePage from "@/pages/partner-culture";

/** 工程師瀏覽、管理員編輯 — 同一路由不同元件 */
export default function PartnerCultureRoute() {
  const { user } = useAuth();
  if (hasRole(user, "super_admin", "owner", "admin")) {
    return <PartnerCulturePage />;
  }
  return <PartnerHome />;
}

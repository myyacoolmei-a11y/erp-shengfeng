import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 排除以下路徑，避免每個靜態資源請求都觸發 Supabase session 檢查：
     * - _next/static, _next/image：Next.js 內部資源
     * - favicon.ico：瀏覽器圖示
     * - 常見圖片副檔名
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 在伺服器端（Server Component / Route Handler / Server Action）使用的 Supabase client。
 * 需搭配 Next.js 的 `cookies()` 才能讀寫登入狀態。
 *
 * 注意：在 Server Component 內呼叫時無法寫入 cookie（Next.js 限制），
 * 若跳出設定 cookie 失敗的錯誤屬正常現象，只要有搭配 `src/middleware.ts`
 * 定期刷新 session 即可。
 */
export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "缺少 Supabase 環境變數，請確認已設定 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // 在 Server Component 中呼叫 setAll 會失敗，
          // 只要有 middleware 負責刷新 session 即可安全忽略。
        }
      },
    },
  });
}

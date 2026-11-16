/**
 * 使用者個人檔案。
 * 對應 Supabase `profiles` 資料表（第一階段尚未建立，先定義前端型別）。
 */
export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

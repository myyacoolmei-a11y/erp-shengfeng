/**
 * 品牌設定，供 AI 產生內容時參考語氣與識別色。
 */
export interface Brand {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  tone: string;
  createdAt: string;
}

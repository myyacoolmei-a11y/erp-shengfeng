/**
 * 內容處理狀態。
 * draft：草稿尚未送出
 * uploaded：素材已上傳
 * analyzing：AI 理解內容中
 * generating：AI 產生版本中
 * review：等待使用者確認
 * published：已發布
 * failed：處理失敗
 */
export type ContentStatus =
  | "draft"
  | "uploaded"
  | "analyzing"
  | "generating"
  | "review"
  | "published"
  | "failed";

/**
 * 素材類型。
 */
export type MediaType = "video" | "image" | "audio" | "text";

/**
 * 影片剪輯風格。
 */
export type EditStyle =
  | "auto"
  | "viral"
  | "brand"
  | "story"
  | "tutorial"
  | "news";

/**
 * 一筆媒體內容紀錄。
 */
export interface MediaContent {
  id: string;
  title: string;
  description: string;
  mediaType: MediaType;
  sourceUrl: string | null;
  status: ContentStatus;
  selectedStyle: EditStyle;
  brandId: string | null;
  createdAt: string;
  updatedAt: string;
}

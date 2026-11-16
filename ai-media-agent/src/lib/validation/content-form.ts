import type { EditStyle, MediaType } from "@/types";

export interface ContentFormValues {
  title: string;
  description: string;
  brandId: string;
  highlights: string;
  style: EditStyle;
}

export interface ContentFormErrors {
  title?: string;
  mediaSource?: string;
}

const TITLE_MIN_LENGTH = 2;
const TITLE_MAX_LENGTH = 60;

interface ValidateOptions {
  /** 是否要求已選擇素材類型並完成上傳／錄製，「讓 AI 開始處理」時需要。 */
  requireMedia: boolean;
  hasMediaFile: boolean;
  mediaType: MediaType | null;
}

export function validateContentForm(
  values: ContentFormValues,
  { requireMedia, hasMediaFile, mediaType }: ValidateOptions
): ContentFormErrors {
  const errors: ContentFormErrors = {};
  const trimmedTitle = values.title.trim();

  if (!trimmedTitle) {
    errors.title = "請輸入內容名稱";
  } else if (trimmedTitle.length < TITLE_MIN_LENGTH) {
    errors.title = `內容名稱至少需要 ${TITLE_MIN_LENGTH} 個字`;
  } else if (trimmedTitle.length > TITLE_MAX_LENGTH) {
    errors.title = `內容名稱請勿超過 ${TITLE_MAX_LENGTH} 個字`;
  }

  if (requireMedia && (!mediaType || !hasMediaFile)) {
    errors.mediaSource = "請先上傳或錄製一份素材";
  }

  return errors;
}

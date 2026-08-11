// 派工單「連續報表紙」（點陣印表機）紙張規格與列印校正設定 — 集中管理
//
// ⚠️ 尚未以實體報表紙覆核精確尺寸與撕線位置。以下紙張尺寸沿用專案既有
// 派工單 PDF 版型（client/src/components/pdf/templates/WorkOrderTemplate.ts）
// 已記錄的 240mm × 140mm（24×14cm）landscape 規格 —— 此規格對應台灣常見
// 「9.5×11 吋中一刀」點陣印表機電腦連續報表紙，裁半後單張約 9.5×5.5 吋
// （約 241×140mm）。若實際採購的連續報表紙規格不同，只需調整下方常數，
// 不需修改任何版面／列印程式碼。
export const CONTINUOUS_PAPER = {
  /** 紙張寬度（mm）。沿用既有派工單 PDF 規格，未重新量測。 */
  WIDTH_MM: 240,
  /** 紙張高度（mm）。沿用既有派工單 PDF 規格，未重新量測。 */
  HEIGHT_MM: 140,

  /**
   * 左右安全邊距（mm）—— 避開連續報表紙左右兩側的送紙孔（拖板孔／
   * sprocket hole）耐張條。此區域內不可出現任何文字、表格或框線。
   * 預設值採用點陣印表機連續報表紙常見的耐張條寬度（約 0.5 吋＝12.7mm）；
   * 若實際紙張耐張條寬度不同，請直接調整此值。
   */
  MARGIN_LEFT_MM: 12.7,
  MARGIN_RIGHT_MM: 12.7,

  /**
   * 上下安全邊距（mm）—— 避開連續報表紙相鄰兩頁交界處的橫向齒孔撕線。
   * 目前紙張尺寸（240×140mm）視為「9.5×11 吋中一刀」報表紙裁切後的
   * 單張半頁：該中央撕線實際落在本頁與上下相鄰頁的交界，因此以下邊距
   * 同時作為撕線安全距離，框線不會壓在撕線上。
   */
  MARGIN_TOP_MM: 6,
  MARGIN_BOTTOM_MM: 6,

  /**
   * 若實際採購的連續報表紙在「寬度」方向另有一道中央撕線（例如常見的
   * 「中2刀」規格，不同於本專案目前假設的「中一刀裁半」規格），
   * 請將此設為 true 並提供正確的安全間距，日後可據此在版面中央預留
   * 空白避讓區。預設關閉（目前假設紙張僅在裁半處有撕線，落於頁面
   * 上下邊界，已由 MARGIN_TOP_MM / MARGIN_BOTTOM_MM 避讓）。
   */
  HAS_VERTICAL_CENTER_TEAR: false,
  VERTICAL_CENTER_TEAR_SAFE_GAP_MM: 3,
} as const;

/** 派工單列印校正：僅影響「正式列印」時的視覺位置，不改變畫面資料或派工單內容。 */
export interface PrintCalibration {
  /** 左右偏移量（mm）。正值向右移動，負值向左移動。 */
  offsetXMm: number;
  /** 上下偏移量（mm）。正值向下移動，負值向上移動。 */
  offsetYMm: number;
}

export const PRINT_CALIBRATION_DEFAULT: PrintCalibration = {
  offsetXMm: 0,
  offsetYMm: 0,
};

const PRINT_CALIBRATION_STORAGE_KEY = "erp_wo_print_calibration";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** 從瀏覽器 localStorage 讀取列印校正值；若不存在或格式錯誤則回傳預設值（0, 0）。 */
export function loadPrintCalibration(): PrintCalibration {
  if (typeof window === "undefined") return { ...PRINT_CALIBRATION_DEFAULT };
  try {
    const raw = window.localStorage.getItem(PRINT_CALIBRATION_STORAGE_KEY);
    if (!raw) return { ...PRINT_CALIBRATION_DEFAULT };
    const parsed = JSON.parse(raw);
    const offsetXMm = isFiniteNumber(parsed?.offsetXMm) ? parsed.offsetXMm : 0;
    const offsetYMm = isFiniteNumber(parsed?.offsetYMm) ? parsed.offsetYMm : 0;
    return { offsetXMm, offsetYMm };
  } catch {
    return { ...PRINT_CALIBRATION_DEFAULT };
  }
}

/** 將列印校正值寫入瀏覽器 localStorage（重新整理頁面後仍保留）。 */
export function savePrintCalibration(calibration: PrintCalibration): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRINT_CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
  } catch {
    // localStorage 無法使用（無痕模式／容量已滿）：僅無法持久保存，不影響本次列印
  }
}

/** 恢復列印校正預設值（0, 0）並寫回 localStorage，回傳恢復後的值。 */
export function resetPrintCalibration(): PrintCalibration {
  savePrintCalibration(PRINT_CALIBRATION_DEFAULT);
  return { ...PRINT_CALIBRATION_DEFAULT };
}

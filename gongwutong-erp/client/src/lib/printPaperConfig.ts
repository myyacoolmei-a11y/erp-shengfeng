// 派工單「連續報表紙」（點陣印表機）紙張規格與列印校正設定 — 集中管理
//
// 實機測試後確認的精確規格：完整連續紙為 9.5×11 英吋，每張派工單使用
// 「中一刀」裁半後的半張，即 9.5×5.5 英吋 = 241.3mm × 139.7mm。
// 之前版本使用四捨五入的 240×140mm，誤差雖小，但已一併修正為精確值，
// 並強化版面以徹底避免水平溢出（避免導致左右切成兩張列印）。
// 若日後實際採購的連續報表紙規格不同，只需調整下方常數，不需修改任何
// 版面／列印程式碼。
export const CONTINUOUS_PAPER = {
  /**
   * 紙張寬度（英吋）＝ 9.5（說明／校正 UI／內容根容器尺寸用）。
   * window.print 的 @page 使用 size:auto，由 Windows 列印對話框的 9.5×5.5
   * 自訂紙張控制直向／橫向；不可在 @page 寫死 mm 尺寸或加 landscape。
   */
  WIDTH_IN: 9.5,
  /** 紙張高度（英吋）＝ 5.5（半張；非整張 11in）。 */
  HEIGHT_IN: 5.5,
  /** 紙張寬度（mm）＝ 9.5 英吋，精確換算 241.3mm。 */
  WIDTH_MM: 241.3,
  /** 紙張高度（mm）＝ 5.5 英吋（9.5×11 英吋整張「中一刀」裁半），精確換算 139.7mm。 */
  HEIGHT_MM: 139.7,

  /**
   * 左右安全邊距（mm）—— 避開連續報表紙左右兩側的送紙孔（拖板孔／
   * sprocket hole）耐張條。此區域內不可出現任何文字、表格或框線。
   * 採用點陣印表機連續報表紙常見的耐張條寬度（0.5 吋＝12.7mm）；
   * 換算後可列印內容寬度恰為 8.5 吋（215.9mm），對應業界常見連續報表紙
   * 扣除左右耐張條後的可印刷寬度。若實際紙張耐張條寬度不同，請直接
   * 調整此值。
   */
  MARGIN_LEFT_MM: 12.7,
  MARGIN_RIGHT_MM: 12.7,

  /**
   * 上下安全邊距（mm）—— 避開連續報表紙相鄰兩頁交界處的橫向齒孔撕線。
   * 目前紙張尺寸（241.3×139.7mm）視為「9.5×11 吋中一刀」報表紙裁切後的
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

/** 與派工單 continuous-print 相同的點陣半張紙盒（9.5×5.5in）。 */
export function continuousPrintPageBoxCss(calibration: PrintCalibration = PRINT_CALIBRATION_DEFAULT): string {
  const {
    WIDTH_MM, HEIGHT_MM,
    MARGIN_LEFT_MM, MARGIN_RIGHT_MM,
    MARGIN_TOP_MM, MARGIN_BOTTOM_MM,
  } = CONTINUOUS_PAPER;
  const offsetXMm = Number.isFinite(calibration?.offsetXMm) ? calibration.offsetXMm : 0;
  const offsetYMm = Number.isFinite(calibration?.offsetYMm) ? calibration.offsetYMm : 0;
  const padTop = MARGIN_TOP_MM + offsetYMm;
  const padRight = Math.max(0, MARGIN_RIGHT_MM - offsetXMm);
  const padBottom = Math.max(0, MARGIN_BOTTOM_MM - offsetYMm);
  const padLeft = Math.max(0, MARGIN_LEFT_MM + offsetXMm);

  return `
/* EPSON 點陣機連續紙半張：${WIDTH_MM}mm × ${HEIGHT_MM}mm（9.5×5.5in）
   @page size:auto;margin:0 — 與已可列印的派工單相同，方向由列印對話框 9.5×5.5 紙張決定。 */
@page{size:auto;margin:0}
html,body{
  box-sizing:border-box;
  width:${WIDTH_MM}mm;
  height:${HEIGHT_MM}mm;
  max-width:${WIDTH_MM}mm;
  max-height:${HEIGHT_MM}mm;
  margin:0;padding:0;
  background:#fff;
  transform:none;
  zoom:normal;
}
.sheet{
  box-sizing:border-box;
  width:${WIDTH_MM}mm;
  height:${HEIGHT_MM}mm;
  max-width:${WIDTH_MM}mm;
  max-height:${HEIGHT_MM}mm;
  padding:${padTop}mm ${padRight}mm ${padBottom}mm ${padLeft}mm;
  break-inside:avoid;
  page-break-inside:avoid;
  page-break-after:avoid;
  page-break-before:avoid;
  break-after:avoid;
  break-before:avoid;
  position:static;
  overflow:visible;
  transform:none;
  zoom:normal;
}
.page{
  box-sizing:border-box;
  display:flex;
  flex-direction:column;
  align-items:stretch;
  justify-content:flex-start;
  width:100%;
  max-width:100%;
  height:100%;
  min-height:100%;
  max-height:100%;
  margin:0;padding:0;
  position:static;
  overflow:visible;
  break-inside:avoid;
  page-break-inside:avoid;
  transform:none;
  zoom:normal;
}`;
}

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

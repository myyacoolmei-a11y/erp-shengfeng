/** 庫存狀態 */
export const INVENTORY_STATUSES = [
  "庫存中",
  "待出貨",
  "已出貨",
  "舊品待維修",
  "維修中",
  "報廢",
] as const;

export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

/** 庫存異動原因 */
export const INVENTORY_TX_REASONS = [
  "進貨",
  "派工領料",
  "客戶退貨",
  "維修",
  "報廢",
  "盤點調整",
] as const;

export type InventoryTxReason = (typeof INVENTORY_TX_REASONS)[number];

/** 異動數量預設正負向（盤點調整可正可負，由使用者輸入） */
export function defaultTxSign(reason: InventoryTxReason): 1 | -1 | 0 {
  switch (reason) {
    case "進貨":
    case "客戶退貨":
      return 1;
    case "派工領料":
    case "報廢":
    case "維修":
      return -1;
    case "盤點調整":
      return 0;
    default:
      return 0;
  }
}

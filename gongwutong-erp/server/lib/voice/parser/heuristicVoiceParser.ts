import type { VoiceFormType, ParsedVoiceResult, ParsedVoiceItem } from "../../../../shared/voice/types.ts";
import { parseQuoteVoice } from "./quoteVoiceParser.ts";

export interface VoiceParser {
  readonly name: string;
  parse(text: string, formType: VoiceFormType): Promise<ParsedVoiceResult>;
}

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

const PHONE_RE = /(?:0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}|09\d{2}[-\s]?\d{3}[-\s]?\d{3})/;
const MODEL_RE = /[A-Z]{1,4}[-/][A-Z0-9][A-Z0-9/-]*/i;
const QTY_UNIT_RE = /^(?:([一二三四五六七八九十两兩\d]+)\s*(台|组|組|式|个|個|套|次|組)?|(?:一台|兩台|两台|一台|一組|兩組|两组))/;
const DATE_RE = /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?|\d{1,2}[-/月]\d{1,2}日?|明天|後天|后天|大後天|大后天|今天)/;
const TIME_RE = /(\d{1,2}[:：]\d{2}|\d{1,2}\s*點|\d{1,2}\s*点)/;

function parseQuantity(raw: string | undefined, fallback = 1): number {
  if (!raw) return fallback;
  const t = raw.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (t === "十") return 10;
  if (t.length === 2 && t[0] === "十" && CN_NUM[t[1]] != null) return 10 + CN_NUM[t[1]];
  if (t.length === 2 && CN_NUM[t[0]] != null && t[1] === "十") return CN_NUM[t[0]] * 10;
  return CN_NUM[t] ?? fallback;
}

function extractQuantityUnit(line: string): { quantity: number; unit: string; rest: string } | null {
  const m = line.match(/^(?:([一二三四五六七八九十两兩\d]+)\s*(台|组|組|式|个|個|套|次)|一台|兩台|两台|一組|兩組|两组)\s*(.*)$/);
  if (!m) return null;
  let quantity = 1;
  let unit = "台";
  let rest = line;
  if (/一台/.test(line)) { quantity = 1; rest = line.replace(/^一台\s*/, ""); }
  else if (/兩台|两台/.test(line)) { quantity = 2; rest = line.replace(/^(?:兩台|两台)\s*/, ""); }
  else if (/一組|一组/.test(line)) { quantity = 1; unit = "組"; rest = line.replace(/^(?:一組|一组)\s*/, ""); }
  else if (/兩組|两组/.test(line)) { quantity = 2; unit = "組"; rest = line.replace(/^(?:兩組|两组)\s*/, ""); }
  else if (m[1]) {
    quantity = parseQuantity(m[1]);
    unit = m[2] ?? "台";
    rest = (m[3] ?? "").trim();
  }
  return { quantity, unit, rest: rest.trim() };
}

function parseProductLine(line: string): ParsedVoiceItem | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const qtyInfo = extractQuantityUnit(trimmed);
  const body = qtyInfo?.rest ?? trimmed;
  const quantity = qtyInfo?.quantity ?? 1;
  const unit = qtyInfo?.unit ?? "台";

  const modelMatch = body.match(MODEL_RE);
  const model = modelMatch?.[0] ?? "";

  let brand = "";
  let itemName = body;
  if (model) {
    const before = body.slice(0, body.indexOf(model)).trim();
    const parts = before.split(/\s+/).filter(Boolean);
    if (parts.length >= 1) brand = parts[0];
    if (parts.length >= 2) itemName = parts.slice(1).join(" ") || model;
    else itemName = model;
  }

  if (!model && !brand) {
    const tokens = body.split(/\s+/);
    if (tokens.length >= 2) {
      brand = tokens[0];
      itemName = tokens.slice(1).join(" ");
    }
  }

  return {
    brand: brand || undefined,
    itemName: itemName || body,
    model: model || undefined,
    quantity,
    unit,
    category: "裝新機",
    inputMode: "manual",
    matched: false,
  };
}

function isWorkLine(line: string): boolean {
  return /安裝|安装|拆機|拆机|移機|移机|保養|保养|維修|维修|清洗|配管|冷媒|施工/.test(line);
}

function isStreetOrRegionLine(line: string): boolean {
  if (/^地址[：:]/.test(line)) return true;
  if (line.length > 30) return false;
  if (REGION_LINE_RE.test(line)) return true;
  if (/[\u4e00-\u9fff]{1,8}(?:路|街|巷|弄)\d+/.test(line)) return true;
  return false;
}

const REGION_LINE_RE =
  /(?:台)?(?:北|新北|桃園|臺中|台中|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江|基隆|新竹|苗栗|高雄|台南)[市縣][\u4e00-\u9fff]{0,8}(?:鄉|鎮|市|區|里|村)?/;

function isLikelyCustomerLine(line: string): boolean {
  if (PHONE_RE.test(line)) return false;
  if (MODEL_RE.test(line)) return false;
  if (QTY_UNIT_RE.test(line)) return false;
  if (isWorkLine(line)) return false;
  if (/地址|電話|电话|路|街|巷|弄|號|号|區|区|市|縣|县/.test(line)) return false;
  return line.length >= 2 && line.length <= 40;
}

function parseDateToken(token: string): string | undefined {
  const today = new Date();
  if (token === "今天") return today.toISOString().split("T")[0];
  if (token === "明天") {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  if (token === "後天" || token === "后天") {
    const d = new Date(today); d.setDate(d.getDate() + 2);
    return d.toISOString().split("T")[0];
  }
  const m = token.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const m2 = token.match(/(\d{1,2})[-/月](\d{1,2})/);
  if (m2) return `${today.getFullYear()}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  return undefined;
}

function parseTimeToken(token: string): string | undefined {
  const m = token.match(/(\d{1,2})[:：](\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  const m2 = token.match(/(\d{1,2})\s*[點点]/);
  if (m2) return `${m2[1].padStart(2, "0")}:00`;
  return undefined;
}

function detectProjectType(text: string): string | undefined {
  if (/維修|维修/.test(text)) return "維修";
  if (/保養|保养/.test(text)) return "保養";
  if (/移機|移机|遷機/.test(text)) return "遷機";
  if (/清洗|拆機|拆机/.test(text)) return "清洗";
  if (/安裝|安装|新裝|装新/.test(text)) return "新裝";
  return undefined;
}

function extractTechnicians(line: string, knownNames: string[]): string[] {
  const found: string[] = [];
  for (const name of knownNames) {
    if (name && line.includes(name)) found.push(name);
  }
  const m = line.match(/技師[：:]\s*([^\n,，]+)/);
  if (m) {
    m[1].split(/[、,，/\s]+/).filter(Boolean).forEach(n => {
      if (!found.includes(n)) found.push(n);
    });
  }
  return found;
}

export function parseVoiceTextHeuristic(
  text: string,
  formType: VoiceFormType,
  options?: { technicianNames?: string[] },
): ParsedVoiceResult {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  let customerName = "";
  let phone = "";
  let address = "";
  const workLines: string[] = [];
  const noteLines: string[] = [];
  const items: ParsedVoiceItem[] = [];
  let scheduledDate: string | undefined;
  let scheduledTime: string | undefined;
  let problemDescription = "";
  let brand = "";
  let model = "";
  let quantity = 1;
  const technicians: string[] = [];

  for (const line of lines) {
    const phoneMatch = line.match(PHONE_RE);
    if (phoneMatch && !phone) {
      phone = phoneMatch[0].replace(/\s/g, "");
      continue;
    }

    if (isStreetOrRegionLine(line)) {
      address = line.replace(/^地址[：:]\s*/, "").trim();
      continue;
    }

    const dateMatch = line.match(DATE_RE);
    if (dateMatch) {
      scheduledDate = parseDateToken(dateMatch[1]) ?? scheduledDate;
    }
    const timeMatch = line.match(TIME_RE);
    if (timeMatch) {
      scheduledTime = parseTimeToken(timeMatch[1]) ?? scheduledTime;
    }

    if (options?.technicianNames?.length) {
      technicians.push(...extractTechnicians(line, options.technicianNames));
    }

    const product = parseProductLine(line);
    if (product && (product.model || product.brand || QTY_UNIT_RE.test(line))) {
      items.push(product);
      continue;
    }

    if (isWorkLine(line)) {
      workLines.push(line);
      continue;
    }

    if (!customerName && isLikelyCustomerLine(line)) {
      customerName = line.replace(/^(客戶|客户)[：:]\s*/, "");
      continue;
    }

    noteLines.push(line);
  }

  const description = workLines.join("\n") || undefined;
  const notes = noteLines.join("\n") || undefined;
  const projectType = detectProjectType(text);

  if (formType === "repair_case") {
    if (items[0]) {
      brand = items[0].brand ?? "";
      model = items[0].model ?? items[0].itemName ?? "";
      quantity = items[0].quantity ?? 1;
    }
    problemDescription = [description, notes].filter(Boolean).join("\n") || text;
    if (/急件|紧急|緊急/.test(text)) {
      return {
        formType: "repair_case",
        customerName: customerName || undefined,
        phone: phone || undefined,
        address: address || undefined,
        brand: brand || undefined,
        model: model || undefined,
        quantity,
        problemDescription,
        priority: "急件",
        appointmentDate: scheduledDate,
        appointmentTime: scheduledTime,
        notes,
      };
    }
    return {
      formType: "repair_case",
      customerName: customerName || undefined,
      phone: phone || undefined,
      address: address || undefined,
      brand: brand || undefined,
      model: model || undefined,
      quantity,
      problemDescription,
      priority: /VIP|vip/.test(text) ? "VIP" : "普通",
      appointmentDate: scheduledDate,
      appointmentTime: scheduledTime,
      notes,
    };
  }

  if (formType === "work_order") {
    return {
      formType: "work_order",
      customerName: customerName || undefined,
      phone: phone || undefined,
      address: address || undefined,
      title: customerName ? `${customerName} 派工` : undefined,
      description,
      notes,
      items: items.length > 0 ? items : undefined,
      scheduledDate,
      scheduledTime,
      technicians: [...new Set(technicians)],
      projectType,
    };
  }

  if (formType === "quote") {
    return parseQuoteVoice(text);
  }

  return parseQuoteVoice(text);
}

/** Rule-based parser — no external API required. */
export class HeuristicVoiceParser implements VoiceParser {
  readonly name = "heuristic";
  private technicianNames: string[];

  constructor(technicianNames: string[] = []) {
    this.technicianNames = technicianNames;
  }

  async parse(text: string, formType: VoiceFormType): Promise<ParsedVoiceResult> {
    return parseVoiceTextHeuristic(text, formType, { technicianNames: this.technicianNames });
  }
}

import { parseQuoteVoice } from "../server/lib/voice/parser/quoteVoiceParser.ts";

const samples = [
  "羽樂體育用品店客戶要一台冰點4.1KW暖機，彰化縣花壇",
  "彰化縣花壇，客戶羽樂體育用品店要一台冰點 4.1KW 暖機",
  "客戶王大明要一台日立 RAS-50HK 分離式冷氣 安裝 台中市西屯",
  "地址：台中市西屯區河南路一段122號，冰點 3.6KW 暖機一台",
];

for (const text of samples) {
  const parsed = parseQuoteVoice(text);
  console.log("---");
  console.log("input:", text);
  console.log(JSON.stringify(parsed, null, 2));
}

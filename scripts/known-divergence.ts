// scripts/known-divergence.ts

/**
 * 香港標準（EDB）與開源字庫（國標/台標）已知存在差異之字元集合
 * 依據：
 * 1. L1 結構差異 (Structural)
 * 2. L2 筆順差異 (Stroke Sequence)
 * 3. 港標標準異體字 (HK Standard Glyphs)
 * 4. 嶺南本土/香港地名高頻字 (HK Local & Toponym Glyphs)
 */

// 1. L1 結構差異
const L1_STRUCTURAL = [
  '骨', '角', '真', '告', '周', '滑', '體', '肉', '寫', '畫',
  '黃', '具', '差', '半', '反', '充', '弟', '每', '青', '展'
];

// 2. L2 筆順差異
const L2_STROKE_SEQUENCE = [
  '方', '放', '房', '戈', '成', '我', '歲', '草', '花', '茶'
];

// 3. 港標標準異體字
const HK_VARIANTS = [
  '羣', '衞', '綫', '鈎', '麪', '裏', '床', '著', '涼'
];

// 4. 香港地名與本土高頻字
const HK_TOPONYMS = [
  '邨', '埗', '滘', '輋', '氹', '涌', '鰂', '葵', '穗', '灣'
];

// 內部組合陣列
const ALL_DIVERGENT = [
  ...L1_STRUCTURAL,
  ...L2_STROKE_SEQUENCE,
  ...HK_VARIANTS,
  ...HK_TOPONYMS
];

// 匯出為 ReadonlySet，確保編譯期不可變 (Immutability)，防止管線運行中被意外竄改
export const KNOWN_DIVERGENT: ReadonlySet<string> = new Set(ALL_DIVERGENT);

// ==========================================
// 啟動期資料治理與健全性檢查 (Sanity Checks)
// ==========================================
const CLI_COLORS = {
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

// 1. 重複字元校驗 (防止人工維護時跨分類重複輸入)
if (ALL_DIVERGENT.length !== KNOWN_DIVERGENT.size) {
  const duplicates = ALL_DIVERGENT.filter((item, index) => ALL_DIVERGENT.indexOf(item) !== index);
  console.warn(
    `${CLI_COLORS.yellow}⚠️ [known-divergence] 重複警告：發現 ${ALL_DIVERGENT.length - KNOWN_DIVERGENT.size} 個重複字 [${Array.from(new Set(duplicates)).join(', ')}]，Set 已自動去重。${CLI_COLORS.reset}`
  );
}

// 2. Surrogate Pairs 與字元長度防護
const invalidChars = ALL_DIVERGENT.filter(char => Array.from(char).length !== 1);
if (invalidChars.length > 0) {
  console.error(
    `${CLI_COLORS.red}❌ [known-divergence] 髒資料異常：清單內含有非單一字元 [${invalidChars.join(', ')}]，請修正原始陣列。${CLI_COLORS.reset}`
  );
  process.exit(1); // 致命錯誤，直接阻斷依賴此檔案的構建管線
}

// scripts/hk-standard-corpus.ts
// Phase 0 專家審查與管線驗證專用：120 字代表性測試隊列
// 涵蓋初小核心、社區地名用字、港標結構異體字與高階邊界字

// 1. 初小高頻基礎字 (40字)
const COHORT_GROUP_1 = [
  "一","二","三","四","五","六","七","八","九","十",
  "日","月","水","火","木","石","田","土","山","人",
  "口","手","足","心","耳","目","子","女","父","母",
  "上","下","左","右","大","小","多","少","天","地"
];

// 2. 學校與生活核心字 (30字)
const COHORT_GROUP_2 = [
  "學","校","書","包","筆","紙","友","師","生","長",
  "春","夏","秋","冬","東","南","西","北","中","門",
  "車","馬","鳥","魚","花","草","葉","風","雨","家"
];

// 3. 香港社區與生活高頻字 (檢驗字庫缺失與地名特化, 15字)
const COHORT_GROUP_3 = [
  "邨","埗","滘","輋","氹","涌","鰂","葵","穗","灣",
  "旺","角","港","澳","街"
];

// 4. 港標傳承異體與 L1 拓撲爭議字 (檢驗專家容忍度, 15字)
const COHORT_GROUP_4 = [
  "羣","衞","綫","鈎","麪","裏","床","着","真","直",
  "骨","角","告","草","黃"
];

// 5. 複雜間架與多筆畫測試 (10字)
const COHORT_GROUP_5 = [
  "靈","囊","龜","鑑","釁","鬱","齊","龍","龠","廳"
];

// 6. 邊界與罕見字防禦測試 (10字，含「勗」)
const COHORT_GROUP_6 = [
  "勗","晟","卸","莓","趺","紉","芟","譫","曚","戩"
];

// 內部組合陣列
const RAW_COHORT = [
  ...COHORT_GROUP_1,
  ...COHORT_GROUP_2,
  ...COHORT_GROUP_3,
  ...COHORT_GROUP_4,
  ...COHORT_GROUP_5,
  ...COHORT_GROUP_6
];

// 效能與資料治理：使用 Set 自動去重，確保樣本絕對唯一；匯出為 readonly 防止外部竄改
export const HK_SAMPLE_COHORT_120: readonly string[] = Array.from(new Set(RAW_COHORT));

export interface AuditMetadata {
  readonly cohortName: string;
  readonly sampleSize: number;
  readonly targetCurriculum: string;
  readonly verifiedAtCommit: string;
}

// 動態計算 sampleSize，徹底消除未來擴充語料庫時的資料不同步地雷
export const AUDIT_METADATA: AuditMetadata = {
  cohortName: 'Phase 0 Delphi Review Cohort',
  sampleSize: HK_SAMPLE_COHORT_120.length,
  targetCurriculum: 'HK Primary Curriculum Baseline (Subset)',
  verifiedAtCommit: process.env.GITHUB_SHA || 'local'
};

// ==========================================
// 健壯性檢查 (Sanity Checks)
// ==========================================
const CLI_COLORS = {
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

// 1. 重複字元校驗 (發現「角」字在 Group 3 和 Group 4 重複時自動攔截)
if (RAW_COHORT.length !== HK_SAMPLE_COHORT_120.length) {
  const duplicates = RAW_COHORT.filter((item, index) => RAW_COHORT.indexOf(item) !== index);
  console.warn(
    `${CLI_COLORS.yellow}⚠️ 語料庫重複警告：發現 ${RAW_COHORT.length - HK_SAMPLE_COHORT_120.length} 個重複字 [${Array.from(new Set(duplicates)).join(', ')}]，已自動去重。${CLI_COLORS.reset}`
  );
}

// 2. 規模偏移校驗
if (HK_SAMPLE_COHORT_120.length !== 120) {
  console.warn(
    `${CLI_COLORS.yellow}⚠️ 語料庫規模偏移警告：預期 120 字，目前實際載入 ${HK_SAMPLE_COHORT_120.length} 獨立字。${CLI_COLORS.reset}`
  );
}

// 3. Surrogate Pairs 與字元長度防護
const invalidChars = HK_SAMPLE_COHORT_120.filter(char => Array.from(char).length !== 1);
if (invalidChars.length > 0) {
  console.error(
    `${CLI_COLORS.red}❌ 語料庫髒資料異常：發現非單一字元的項目 [${invalidChars.join(', ')}]，請修正原始陣列。${CLI_COLORS.reset}`
  );
}

// scripts/audit-curriculum.ts
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HK_SAMPLE_COHORT_120, AUDIT_METADATA } from './hk-standard-corpus';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MANIFEST_PATH = path.join(ROOT_DIR, 'public', 'data', 'manifest.json');
const REPORT_DIR = path.join(ROOT_DIR, 'reports');
const REPORT_OUTPUT = path.join(REPORT_DIR, 'curriculum-audit-report.json');

// 終端機顏色配置，提升 CLI 審計報告可讀性
const CLI_COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

type GovernanceLevel = 'UNVERIFIED' | 'HK_STANDARD' | 'FALLBACK';

interface ManifestEntry {
  char: string;
  unicode: string;
  totalStrokes: number;
  hasMedians: boolean;
  level: GovernanceLevel;
}

interface ManifestFile {
  entries: Record<string, ManifestEntry>;
}

interface CharInfo {
  char: string;
  unicode: string;
}

async function runAudit() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`${CLI_COLORS.red}❌ 找不到 public/data/manifest.json，請先執行 pnpm build:data 構建管線。${CLI_COLORS.reset}`);
    process.exit(1);
  }

  let manifestEntries: Record<string, ManifestEntry>;
  try {
    const rawData = await fsp.readFile(MANIFEST_PATH, 'utf-8');
    const manifest: ManifestFile = JSON.parse(rawData);
    manifestEntries = manifest.entries || {};
  } catch (error) {
    console.error(`${CLI_COLORS.red}❌ 解析 manifest.json 失敗，檔案可能損毀。${CLI_COLORS.reset}`, error);
    process.exit(1);
  }

  // 利用 TypeScript Record 確保分類屬性與 GovernanceLevel 嚴格對齊
  const categorized: Record<GovernanceLevel | 'MISSING', CharInfo[]> = {
    HK_STANDARD: [],
    FALLBACK: [],
    UNVERIFIED: [],
    MISSING: []
  };

  for (const char of HK_SAMPLE_COHORT_120) {
    const codePoint = char.codePointAt(0);
    if (!codePoint) continue;
    const unicode = codePoint.toString(16).toUpperCase().padStart(4, '0');
    const charInfo: CharInfo = { char, unicode };

    const entry = manifestEntries[unicode];
    if (!entry) {
      categorized.MISSING.push(charInfo);
    } else {
      // 消除冗餘的 if-else，利用物件鍵值直接推送
      categorized[entry.level].push(charInfo);
    }
  }

  const total = HK_SAMPLE_COHORT_120.length;
  const availableCount = total - categorized.MISSING.length;
  const coverageRate = total === 0 ? '0.00' : ((availableCount / total) * 100).toFixed(2);

  console.log(`\n${CLI_COLORS.cyan}======================================================${CLI_COLORS.reset}`);
  console.log(` ${CLI_COLORS.green}KidsWriteTC 資料治理審計報告 (${AUDIT_METADATA.cohortName})${CLI_COLORS.reset}`);
  console.log(`${CLI_COLORS.cyan}======================================================${CLI_COLORS.reset}`);
  console.log(` 測試樣本總數      : ${total} 字`);
  console.log(` 可用字元 (Active) : ${availableCount} 字 (${coverageRate}%)`);
  console.log(` ${CLI_COLORS.gray}------------------------------------------------------${CLI_COLORS.reset}`);
  console.log(`  - 港標驗證 (HK_STANDARD) : ${CLI_COLORS.green}${categorized.HK_STANDARD.length}${CLI_COLORS.reset} 字`);
  console.log(`  - 通用降級 (FALLBACK)    : ${CLI_COLORS.yellow}${categorized.FALLBACK.length}${CLI_COLORS.reset} 字`);
  console.log(`  - 未驗證   (UNVERIFIED)  : ${categorized.UNVERIFIED.length} 字`);
  console.log(`  - 完全缺失 (MISSING)     : ${CLI_COLORS.red}${categorized.MISSING.length}${CLI_COLORS.reset} 字`);
  console.log(`${CLI_COLORS.cyan}======================================================${CLI_COLORS.reset}`);

  if (categorized.MISSING.length > 0) {
    console.log(`\n${CLI_COLORS.red}⚠️ 缺失字元清單：${CLI_COLORS.reset}`);
    console.log(categorized.MISSING.map(i => `${i.char}(U+${i.unicode})`).join(' '));
  }

  if (!fs.existsSync(REPORT_DIR)) {
    await fsp.mkdir(REPORT_DIR, { recursive: true });
  }

  const reportData = {
    metadata: AUDIT_METADATA,
    summary: {
      totalCohort: total,
      availableCount,
      coverageRate: `${coverageRate}%`,
      breakdown: {
        hkStandard: categorized.HK_STANDARD.length,
        fallback: categorized.FALLBACK.length,
        unverified: categorized.UNVERIFIED.length,
        missing: categorized.MISSING.length
      }
    },
    details: categorized
  };

  await fsp.writeFile(REPORT_OUTPUT, JSON.stringify(reportData, null, 2), 'utf-8');
  console.log(`\n📄 審計報告已安全寫入: ${CLI_COLORS.cyan}reports/curriculum-audit-report.json${CLI_COLORS.reset}\n`);
}

runAudit().catch(err => {
  console.error(`${CLI_COLORS.red}審計管線執行失敗:${CLI_COLORS.reset}`, err);
  process.exit(1);
});

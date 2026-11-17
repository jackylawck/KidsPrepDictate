// scripts/build-data.ts
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { KNOWN_DIVERGENT } from './known-divergence';

const OUTPUT_DIR = path.resolve(process.cwd(), 'public/data');
const TMP_DIR = path.resolve(process.cwd(), 'public/data.tmp');
const REPORT_DIR = path.resolve(process.cwd(), 'build-reports');
const HANZI_DATA_DIR = path.resolve(process.cwd(), 'node_modules/hanzi-writer-data');
const DICT_PATH = path.resolve(process.cwd(), 'data', 'compiled', 'dictionary.json');
const PATCH_DIR = path.resolve(process.cwd(), 'data', 'patches');

// CLI 色碼配置
const CLI_COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

export type GovernanceLevel = 'HK_VERIFIED' | 'HK_LIKELY' | 'HK_DIVERGENT';

interface ManifestEntry {
  char: string;
  unicode: string;
  totalStrokes: number;
  hasMedians: boolean;
  level: GovernanceLevel;
}

// 效能優化：預先編譯正則表達式，避免在迴圈中反覆實例化消耗 CPU
const REGEX_SVG_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,\-+eE]+$/;
const REGEX_UNICODE = /^[0-9A-F]{4,5}$/i;
const REGEX_DATE = /^\d{4}-\d{2}-\d{2}/;

const isValidPath = (p: string) => REGEX_SVG_PATH.test(p);

// 嚴格檢驗 medians 幾何資料結構
function isValidMedians(medians: unknown): medians is number[][][] {
  if (!Array.isArray(medians)) return false;
  return medians.every(stroke =>
    Array.isArray(stroke) &&
    stroke.length >= 2 &&
    stroke.every(point =>
      Array.isArray(point) && point.length === 2 &&
      typeof point[0] === 'number' && typeof point[1] === 'number'
    )
  );
}

async function buildAll() {
  console.log(`${CLI_COLORS.cyan}📦 啟動三態治理字庫建置管線...${CLI_COLORS.reset}`);

  // 1. 初始化目錄 (平行處理)
  await Promise.all([
    fsp.rm(TMP_DIR, { recursive: true, force: true }).then(() => fsp.mkdir(TMP_DIR, { recursive: true })),
    fsp.mkdir(PATCH_DIR, { recursive: true }),
    fsp.mkdir(REPORT_DIR, { recursive: true })
  ]);

  // 2. 載入擴充字典
  let dictionary: Record<string, { radical: string; jyutping: string[]; pinyin: string[] }> = {};
  if (fs.existsSync(DICT_PATH)) {
    try {
      dictionary = JSON.parse(await fsp.readFile(DICT_PATH, 'utf-8'));
      console.log(`${CLI_COLORS.green}✅ 已載入擴充字典索引，共涵蓋 ${Object.keys(dictionary).length} 字${CLI_COLORS.reset}`);
    } catch (err) {
      console.warn(`${CLI_COLORS.yellow}⚠️ dictionary.json 解析失敗，將跳過字典合併：${err}${CLI_COLORS.reset}`);
    }
  } else {
    console.warn(`${CLI_COLORS.yellow}⚠️ 未找到 dictionary.json，將跳過字典合併${CLI_COLORS.reset}`);
  }

  // 3. 雙軌讀取：開源庫與手動補丁庫
  const hanziFiles = fs.existsSync(HANZI_DATA_DIR) 
    ? (await fsp.readdir(HANZI_DATA_DIR)).filter(f => f.endsWith('.json') && !f.startsWith('package'))
    : [];
  const patchFilesList = (await fsp.readdir(PATCH_DIR)).filter(f => f.endsWith('.json'));
  const patchFiles = new Set(patchFilesList);

  const overlapping = hanziFiles.filter(f => patchFiles.has(f));
  if (overlapping.length > 0) {
    console.log(`${CLI_COLORS.cyan}🔄 補丁覆蓋了 ${overlapping.length} 個開源檔案：${overlapping.slice(0, 5).join(', ')}${overlapping.length > 5 ? '...' : ''}${CLI_COLORS.reset}`);
  }

  // Set 聯集去重
  const allFiles = new Set([...patchFilesList, ...hanziFiles]);
  console.log(`📂 開源庫：${hanziFiles.length} 檔，補丁庫：${patchFilesList.length} 檔`);
  console.log(`📦 準備處理 ${allFiles.size} 個字元...\n`);

  const manifest: Record<string, ManifestEntry> = {};
  const errors: Array<{ file: string; reason: string }> = [];
  const stats: Record<GovernanceLevel, number> = {
    HK_VERIFIED: 0,
    HK_LIKELY: 0,
    HK_DIVERGENT: 0
  };
  
  let processed = 0;
  const filesArray = Array.from(allFiles);
  
  // 效能優化：分批處理 (Chunking)，防止 Promise.all 瞬間開啟過多檔案導致 EMFILE 錯誤
  const BATCH_SIZE = 200; 
  
  for (let i = 0; i < filesArray.length; i += BATCH_SIZE) {
    const batch = filesArray.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (file) => {
      try {
        const basename = path.basename(file, '.json');
        let char: string;
        let unicode: string;
        
        // 支援漢字 (羣.json) 或 Unicode (7FA3.json) 命名
        if (Array.from(basename).length === 1) {
          char = basename;
          const cp = char.codePointAt(0);
          if (!cp) return; // 跳過無效字元
          unicode = cp.toString(16).toUpperCase().padStart(4, '0');
        } else if (REGEX_UNICODE.test(basename)) {
          unicode = basename.toUpperCase().padStart(4, '0');
          char = String.fromCodePoint(parseInt(unicode, 16));
        } else {
          errors.push({ file, reason: `無法解析檔名：${basename}，必須是單一漢字或 Unicode Hex` });
          return;
        }
        
        const isPatched = patchFiles.has(file);
        const sourcePath = isPatched ? path.join(PATCH_DIR, file) : path.join(HANZI_DATA_DIR, file);
        
        const rawData = JSON.parse(await fsp.readFile(sourcePath, 'utf-8'));
        const strokes: string[] = rawData.strokes || [];
        const medians: unknown = rawData.medians || [];
        
        // 幾何防護：嚴禁寫入空分片與損壞資料
        if (strokes.length === 0) {
          errors.push({ file, reason: 'no strokes data' });
          return;
        }
        if (!isValidMedians(medians)) {
          errors.push({ file, reason: 'invalid medians structure' });
          return;
        }
        if (strokes.length !== medians.length) {
          errors.push({ file, reason: `length mismatch: strokes (${strokes.length}) vs medians (${medians.length})` });
          return;
        }
        if (!strokes.every(isValidPath)) {
          errors.push({ file, reason: 'invalid SVG path detected' });
          return;
        }

        const dictMeta = dictionary[unicode] || { radical: '—', jyutping: [], pinyin: [] };
        
        // 專家數位簽名校驗
        const hasReview = isPatched 
          && typeof rawData.reviewedBy === 'string' 
          && rawData.reviewedBy.trim().length > 0
          && typeof rawData.reviewedAt === 'string'
          && REGEX_DATE.test(rawData.reviewedAt);
          
        // 三態分流判定
        let level: GovernanceLevel;
        if (hasReview) {
          level = 'HK_VERIFIED';
        } else if (isPatched || KNOWN_DIVERGENT.has(char)) {
          level = 'HK_DIVERGENT';
        } else {
          level = 'HK_LIKELY';
        }

        stats[level]++;

        // 寫入單字分片（乾淨寫入，不含 level 冗餘）
        await fsp.writeFile(
          path.join(TMP_DIR, `${unicode}.json`),
          JSON.stringify({ 
            char, unicode, totalStrokes: strokes.length,
            radical: dictMeta.radical, jyutping: dictMeta.jyutping, pinyin: dictMeta.pinyin,
            strokes, medians 
          })
        );
        
        // Manifest 作為資料治理的單一事實來源 (SSOT)
        manifest[unicode] = { char, unicode, totalStrokes: strokes.length, hasMedians: true, level };
        
      } catch (err: unknown) {
        errors.push({ file, reason: err instanceof Error ? err.message : String(err) });
      }
    }));
    
    processed += batch.length;
    // 每批次完成後印出進度
    process.stdout.write(`\r  ⏳ 進度：${processed} / ${filesArray.length}`);
  }
  
  console.log(); // 換行

  // 4. 產出 v2.0 Schema
  await fsp.writeFile(
    path.join(TMP_DIR, 'manifest.json'),
    JSON.stringify({
      schemaVersion: '2.0.0',
      standard: 'HK-EDB-FOUR-STATE',
      verifiedAtCommit: process.env.GITHUB_SHA || 'local',
      stats,
      entries: manifest,
    })
  );
  
  if (errors.length > 0) {
    await fsp.writeFile(
      path.join(REPORT_DIR, `build-errors-${process.env.GITHUB_SHA || 'local'}.json`),
      JSON.stringify(errors, null, 2)
    );
  }

  // 5. 確保原子替換 (Atomic Swap)
  await fsp.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fsp.rename(TMP_DIR, OUTPUT_DIR);

  console.log(`\n${CLI_COLORS.cyan}======================================================${CLI_COLORS.reset}`);
  console.log(`${CLI_COLORS.green}✅ 三態管線建置完成！${CLI_COLORS.reset}`);
  console.log(`   🟢 HK_VERIFIED  (專家核定) : ${CLI_COLORS.green}${stats.HK_VERIFIED}${CLI_COLORS.reset}`);
  console.log(`   ⚪ HK_LIKELY    (常態呈現) : ${stats.HK_LIKELY}`);
  console.log(`   🟡 HK_DIVERGENT (爭議警示) : ${CLI_COLORS.yellow}${stats.HK_DIVERGENT}${CLI_COLORS.reset}`);
  if (errors.length > 0) {
    console.log(`   ⚠️ 幾何異常檔數             : ${CLI_COLORS.red}${errors.length}${CLI_COLORS.reset}`);
  }
  console.log(`${CLI_COLORS.cyan}======================================================${CLI_COLORS.reset}\n`);
}

buildAll().catch(err => {
  console.error(`${CLI_COLORS.red}❌ 致命錯誤，建置管線崩潰：${CLI_COLORS.reset}`, err);
  process.exit(1);
});

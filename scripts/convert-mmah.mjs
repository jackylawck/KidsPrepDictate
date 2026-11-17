// scripts/convert-mmah.mjs
// 用法：
//   1. 200 字雙邊驗證預演：node scripts/convert-mmah.mjs --limit=200 --dry-run --require-verified
//   2. 寫入 200 字子集：    node scripts/convert-mmah.mjs --limit=200 --require-verified
//   3. 全量生成 3000 字：   NODE_OPTIONS=--max-old-space-size=1024 node scripts/convert-mmah.mjs
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const GRAPHICS_PATH = path.resolve('raw-data/graphics.txt');
const HK_CHARLIST_PATH = path.resolve('raw-data/hk-chars.json');
const OUTPUT_DIR = path.resolve('public/data');
const REPORT_DIR = path.resolve('raw-data/reports');

// CLI 色碼配置
const CLI_COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const DRY_RUN = process.argv.includes('--dry-run');
const REQUIRE_VERIFIED = process.argv.includes('--require-verified');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  if (!fs.existsSync(GRAPHICS_PATH) || !fs.existsSync(HK_CHARLIST_PATH)) {
    console.error(`${CLI_COLORS.red}❌ 請先準備 raw-data/graphics.txt 與 raw-data/hk-chars.json${CLI_COLORS.reset}`);
    process.exit(1);
  }

  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  await fsp.mkdir(REPORT_DIR, { recursive: true });

  const rawList = JSON.parse(await fsp.readFile(HK_CHARLIST_PATH, 'utf-8'));
  const targetList = rawList.slice(0, LIMIT);
  const targetMap = new Map(targetList.map(item => [item.char, item.strokes ?? null]));

  const modeLabels = [
    DRY_RUN ? `${CLI_COLORS.yellow}DRY-RUN 預演${CLI_COLORS.cyan}` : '正式寫入',
    REQUIRE_VERIFIED ? '僅限雙邊驗證' : '含單邊驗證字'
  ].join(' ｜ ');
  
  console.log(`${CLI_COLORS.cyan}📚 準備處理香港小學字表：共 ${targetMap.size} 字（${modeLabels}）...${CLI_COLORS.reset}`);

  const mmahMap = new Map();
  const rl = readline.createInterface({
    input: fs.createReadStream(GRAPHICS_PATH, { encoding: 'utf-8' }),
    crlfDelay: Infinity
  });

  try {
    for await (const line of rl) {
      if (!line.trim() || !line.startsWith('{')) continue; // 快速過濾非 JSON 行
      try {
        const entry = JSON.parse(line);
        if (targetMap.has(entry.character)) {
          mmahMap.set(entry.character, entry);
        }
      } catch { /* 忽略單行 JSON 解析異常 */ }
    }
  } catch (err) {
    console.error(`${CLI_COLORS.red}❌ 讀取 graphics.txt 時發生磁碟或串流錯誤：${err.message}${CLI_COLORS.reset}`);
    process.exit(1);
  }

  if (mmahMap.size === 0) {
    console.error(`${CLI_COLORS.red}❌ graphics.txt 解析出 0 條有效記錄——請檢查檔案是否下載完整（避免誤存為 HTML 404 頁面）。${CLI_COLORS.reset}`);
    process.exit(1);
  }

  const matchRate = mmahMap.size / targetMap.size;
  if (matchRate < 0.5) {
    console.warn(`${CLI_COLORS.yellow}⚠️  graphics.txt 只匹配到 ${mmahMap.size}/${targetMap.size} 字（${(matchRate * 100).toFixed(1)}%）`);
    console.warn(`   預期繁體字匹配率應為 85-90%，請檢查是否誤用了簡體優先舊版 graphics.txt。${CLI_COLORS.reset}`);
  }

  let successCount = 0;
  let incompleteStrokesCount = 0;
  const missingChars = [];
  const reviewChars = [];
  const unverifiedChars = [];
  const allAcceptedSamples = [];
  
  const writePromises = [];
  const BATCH_SIZE = 200; // 效能優化：批次寫入上限

  for (const [char, hkStrokeCount] of targetMap.entries()) {
    const entry = mmahMap.get(char);

    if (!entry || !Array.isArray(entry.medians) || entry.medians.length === 0) {
      missingChars.push(char);
      continue;
    }

    const mmahStrokeCount = entry.medians.length;

    if (typeof hkStrokeCount === 'number') {
      if (Math.abs(mmahStrokeCount - hkStrokeCount) > 1) {
        reviewChars.push(`${char}\t港標:${hkStrokeCount}劃\tMMAH:${mmahStrokeCount}劃`);
        continue;
      }
    } else {
      unverifiedChars.push(`${char}\tMMAH:${mmahStrokeCount}劃`);
      if (REQUIRE_VERIFIED) continue;
    }

    if (!Array.isArray(entry.strokes) || entry.strokes.length !== mmahStrokeCount) {
      incompleteStrokesCount++;
    }

    const code = char.codePointAt(0);
    if (!code) continue;
    const unicode = code.toString(16).toUpperCase().padStart(4, '0');

    if (!DRY_RUN) {
      const payload = {
        char,
        unicode,
        totalStrokes: mmahStrokeCount,
        strokes: entry.strokes || [],
        medians: entry.medians
      };
      
      const filePath = path.join(OUTPUT_DIR, `${unicode}.json`);
      writePromises.push(fsp.writeFile(filePath, JSON.stringify(payload), 'utf-8'));
      
      // 達到批次上限時等待寫入完成，防止 EMFILE 錯誤與內存暴增
      if (writePromises.length >= BATCH_SIZE) {
        await Promise.all(writePromises);
        writePromises.length = 0;
      }
    }

    allAcceptedSamples.push(`${char} (${unicode}.json, ${mmahStrokeCount} 劃)`);
    successCount++;
  }
  
  // 寫入剩餘的檔案
  if (writePromises.length > 0) {
    await Promise.all(writePromises);
  }

  // 異步寫入報告檔案
  await Promise.all([
    fsp.writeFile(path.join(REPORT_DIR, 'missing.txt'), missingChars.join('\n'), 'utf-8'),
    fsp.writeFile(path.join(REPORT_DIR, 'review.txt'), reviewChars.join('\n'), 'utf-8'),
    fsp.writeFile(path.join(REPORT_DIR, 'unverified.txt'), unverifiedChars.join('\n'), 'utf-8')
  ]);

  const randomSamples = shuffle(allAcceptedSamples).slice(0, 5);

  console.log(DRY_RUN 
    ? `\n${CLI_COLORS.yellow}🧪 DRY-RUN 預演摘要（未寫入 public/data/）：${CLI_COLORS.reset}` 
    : `\n${CLI_COLORS.green}✅ 正式轉換完成摘要：${CLI_COLORS.reset}`
  );
  
  console.log(`   - 通過並輸出：${CLI_COLORS.green}${successCount}${CLI_COLORS.reset} 字`);
  console.log(`   - 無港標單邊驗證：${unverifiedChars.length} 字${REQUIRE_VERIFIED ? '（已因 --require-verified 略過）' : '（已接受並寫入）'}`);
  console.log(`   - 字庫缺失（已隔離）：${CLI_COLORS.red}${missingChars.length}${CLI_COLORS.reset} 字（見 raw-data/reports/missing.txt）`);
  console.log(`   - 筆劃差異（已隔離）：${CLI_COLORS.yellow}${reviewChars.length}${CLI_COLORS.reset} 字（見 raw-data/reports/review.txt）`);
  
  if (incompleteStrokesCount > 0) {
    console.log(`   - 提示：有 ${CLI_COLORS.gray}${incompleteStrokesCount}${CLI_COLORS.reset} 字的描紅輪廓（strokes）與中位線數量不符，不影響默書驗證`);
  }
  if (randomSamples.length > 0) {
    console.log(`   - 隨機抽樣預覽：${CLI_COLORS.cyan}${randomSamples.join('、')}${CLI_COLORS.reset}\n`);
  }
}

main().catch(err => {
  console.error(`${CLI_COLORS.red}❌ 致命錯誤：${err.message}${CLI_COLORS.reset}`);
  process.exit(1);
});

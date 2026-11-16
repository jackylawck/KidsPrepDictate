// scripts/convert-mmah.mjs
// 用法：
//   1. 200 字雙邊驗證預演：node scripts/convert-mmah.mjs --limit=200 --dry-run --require-verified
//   2. 寫入 200 字子集：    node scripts/convert-mmah.mjs --limit=200 --require-verified
//   3. 全量生成 3000 字：   NODE_OPTIONS=--max-old-space-size=1024 node scripts/convert-mmah.mjs
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const GRAPHICS_PATH = path.resolve('raw-data/graphics.txt');
const HK_CHARLIST_PATH = path.resolve('raw-data/hk-chars.json');
const OUTPUT_DIR = path.resolve('public/data');
const REPORT_DIR = path.resolve('raw-data/reports');

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
    console.error('❌ 請先準備 raw-data/graphics.txt 與 raw-data/hk-chars.json');
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const rawList = JSON.parse(fs.readFileSync(HK_CHARLIST_PATH, 'utf-8'));
  const targetList = rawList.slice(0, LIMIT);
  const targetMap = new Map(targetList.map(item => [item.char, item.strokes ?? null]));

  const modeLabels = [
    DRY_RUN ? 'DRY-RUN 預演' : '正式寫入',
    REQUIRE_VERIFIED ? '僅限雙邊驗證' : '含單邊驗證字'
  ].join('｜');
  console.log(`📚 準備處理香港小學字表：共 ${targetMap.size} 字（${modeLabels}）...`);

  const mmahMap = new Map();
  const rl = readline.createInterface({
    input: fs.createReadStream(GRAPHICS_PATH, { encoding: 'utf-8' }),
    crlfDelay: Infinity
  });

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (targetMap.has(entry.character)) {
          mmahMap.set(entry.character, entry);
        }
      } catch { /* 忽略格式異常行 */ }
    }
  } catch (err) {
    console.error('❌ 讀取 graphics.txt 時發生磁碟或串流錯誤：', err.message);
    process.exit(1);
  }

  if (mmahMap.size === 0) {
    console.error('❌ graphics.txt 解析出 0 條有效記錄——請檢查檔案是否下載完整（避免誤存為 HTML 404 頁面）。');
    process.exit(1);
  }

  const matchRate = mmahMap.size / targetMap.size;
  if (matchRate < 0.5) {
    console.warn(`⚠️  graphics.txt 只匹配到 ${mmahMap.size}/${targetMap.size} 字（${(matchRate * 100).toFixed(1)}%）`);
    console.warn('   預期繁體字匹配率應為 85-90%，請檢查是否誤用了簡體優先舊版 graphics.txt。');
  }

  let successCount = 0;
  let incompleteStrokesCount = 0;
  const missingChars = [];
  const reviewChars = [];
  const unverifiedChars = [];
  const allAcceptedSamples = [];

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

    // MMAH medians 原生為 1024x1024 Cartesian Y-up，與 screenToHanziCoords 一致，直接輸出不翻轉
    const payload = {
      char,
      unicode,
      totalStrokes: mmahStrokeCount,
      strokes: entry.strokes || [],
      medians: entry.medians
    };

    if (!DRY_RUN) {
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${unicode}.json`),
        JSON.stringify(payload),
        'utf-8'
      );
    }

    allAcceptedSamples.push(`${char} (${unicode}.json, ${mmahStrokeCount} 劃)`);
    successCount++;
  }

  fs.writeFileSync(path.join(REPORT_DIR, 'missing.txt'), missingChars.join('\n'), 'utf-8');
  fs.writeFileSync(path.join(REPORT_DIR, 'review.txt'), reviewChars.join('\n'), 'utf-8');
  fs.writeFileSync(path.join(REPORT_DIR, 'unverified.txt'), unverifiedChars.join('\n'), 'utf-8');

  const randomSamples = shuffle(allAcceptedSamples).slice(0, 5);

  console.log(DRY_RUN ? '\n🧪 DRY-RUN 預演摘要（未寫入 public/data/）：' : '\n✅ 正式轉換完成摘要：');
  console.log(`   - 通過並輸出：${successCount} 字`);
  console.log(`   - 無港標單邊驗證：${unverifiedChars.length} 字${REQUIRE_VERIFIED ? '（已因 --require-verified 略過）' : '（已接受並寫入）'}`);
  console.log(`   - 字庫缺失（已隔離）：${missingChars.length} 字（見 raw-data/reports/missing.txt）`);
  console.log(`   - 筆劃差異（已隔離）：${reviewChars.length} 字（見 raw-data/reports/review.txt）`);
  if (incompleteStrokesCount > 0) {
    console.log(`   - 提示：有 ${incompleteStrokesCount} 字的描紅輪廓（strokes）與中位線數量不符，不影響默書驗證`);
  }
  if (randomSamples.length > 0) {
    console.log(`   - 隨機抽樣預覽：${randomSamples.join('、')}`);
  }
}

main();

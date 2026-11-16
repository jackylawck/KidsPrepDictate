// scripts/prepare-hk-chars.mjs
// 用法：
//   有表頭 CSV / JSON：node scripts/prepare-hk-chars.mjs
//   無表頭 CSV 指定列序：node scripts/prepare-hk-chars.mjs --cols=char,grade,strokes
import fs from 'node:fs';
import path from 'node:path';

const RAW_DIR = path.resolve('raw-data');
const OUT_PATH = path.join(RAW_DIR, 'hk-chars.json');

const colsArg = process.argv.find(arg => arg.startsWith('--cols='));
const COL_SPEC = colsArg ? colsArg.split('=')[1] : 'char,grade,strokes';

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }
    if (ch === ',' && !inQuote) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function loadCsv(csvPath, colSpec) {
  const text = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]);
  const findIdx = (patterns) => header.findIndex(h => patterns.some(p => h.toLowerCase().includes(p)));

  let charIdx = -1;
  let gradeIdx = -1;
  let strokesIdx = -1;
  let dataStart = 0;

  const hChar = findIdx(['字', 'char']);
  if (hChar >= 0) {
    charIdx = hChar;
    gradeIdx = findIdx(['年級', '年级', 'grade', 'level']);
    strokesIdx = findIdx(['筆劃', '筆畫', '笔画', 'stroke']);
    dataStart = 1;
  } else {
    const spec = colSpec.split(',').map(s => s.trim().toLowerCase());
    charIdx = spec.indexOf('char');
    gradeIdx = spec.indexOf('grade');
    strokesIdx = spec.indexOf('strokes');
  }

  if (charIdx < 0) {
    console.error('❌ 找不到「字」欄位，請確認 CSV 表頭或使用 --cols=char,grade,strokes 指定列序');
    process.exit(1);
  }

  const records = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const ch = cols[charIdx];
    if (!ch || !/^[\u4e00-\u9fff]$/.test(ch)) continue;

    // 嚴格匹配純數字，防止粵音聲調（如 jat1）或文字被誤抽成數字
    let grade = 99;
    if (gradeIdx >= 0 && cols[gradeIdx]) {
      const gStr = cols[gradeIdx].trim();
      if (/^\d+$/.test(gStr)) {
        const g = parseInt(gStr, 10);
        if (g >= 1 && g <= 6) grade = g;
      }
    }

    let strokes = null;
    if (strokesIdx >= 0 && cols[strokesIdx]) {
      const sStr = cols[strokesIdx].trim();
      if (/^\d+$/.test(sStr)) {
        const s = parseInt(sStr, 10);
        if (s >= 1 && s <= 36) strokes = s;
      }
    }

    records.push({ char: ch, grade, strokes });
  }

  return records;
}

function loadRawRecords() {
  const jsonPath = path.join(RAW_DIR, 'hk-raw.json');
  const csvPath = path.join(RAW_DIR, 'hk-raw.csv');
  const txtPath = path.join(RAW_DIR, 'hk-raw.txt');

  if (fs.existsSync(jsonPath)) {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8').replace(/^\uFEFF/, ''));
    return raw.map(r => {
      const g = Number(r['年級'] ?? r['年级'] ?? r.grade ?? 0);
      const s = Number(r['筆劃'] ?? r['筆畫'] ?? r.strokes ?? 0);
      return {
        char: String(r['字'] ?? r.char ?? '').trim(),
        grade: Number.isInteger(g) && g >= 1 && g <= 6 ? g : 99,
        strokes: Number.isInteger(s) && s >= 1 && s <= 36 ? s : null
      };
    });
  }

  if (fs.existsSync(csvPath)) {
    return loadCsv(csvPath, COL_SPEC);
  }

  if (fs.existsSync(txtPath)) {
    console.error('❌ 純文字格式（hk-raw.txt）無法提供年級資訊，會導致 --limit=200 抽樣失準。');
    console.error('   請改用含表頭的 raw-data/hk-raw.csv，或建立 raw-data/hk-raw.json（格式：[{"字":"一","年級":1,"筆劃":1}]）');
    process.exit(1);
  }

  console.error('❌ 找不到輸入檔！請在 raw-data/ 放入 hk-raw.csv 或 hk-raw.json');
  process.exit(1);
}

function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const records = loadRawRecords();

  const dedupMap = new Map();
  for (const item of records) {
    if (!/^[\u4e00-\u9fff]$/.test(item.char)) continue;
    const existing = dedupMap.get(item.char);
    if (
      !existing ||
      item.grade < existing.grade ||
      (item.grade === existing.grade && existing.strokes == null && typeof item.strokes === 'number')
    ) {
      dedupMap.set(item.char, {
        char: item.char,
        grade: item.grade,
        strokes: typeof item.strokes === 'number' ? item.strokes : existing?.strokes ?? null
      });
    }
  }

  const sorted = Array.from(dedupMap.values()).sort((a, b) => a.grade - b.grade);
  const hasGradeInfo = sorted.some(item => item.grade >= 1 && item.grade <= 6);

  fs.writeFileSync(OUT_PATH, JSON.stringify(sorted, null, 2), 'utf-8');

  console.log(`✅ 已生成 raw-data/hk-chars.json（共 ${sorted.length} 個不重複繁體字）`);
  if (!hasGradeInfo) {
    console.warn('⚠️  警告：輸入資料未包含有效年級（1-6），--limit=200 將按原檔順序而非年級抽取！');
  }
  console.log(`🔍 前 40 字預覽：${sorted.slice(0, 40).map(x => x.char).join('')}`);
}

main();

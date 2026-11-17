// scripts/compile-dict.ts
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const RAW_DIR = path.resolve(process.cwd(), 'data', 'raw');
const COMPILED_DIR = path.resolve(process.cwd(), 'data', 'compiled');
const DICT_OUTPUT = path.join(COMPILED_DIR, 'dictionary.json');

// CLI 色碼配置
const CLI_COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

interface JyutpingEntry {
  jyutping: string;
  weight: number;
}

interface CharDictionary {
  [unicode: string]: {
    radical: string;
    jyutping: string[];
    pinyin: string[];
  };
}

const KANGXI_RADICALS = [
  '一','丨','丶','丿','乙','亅','二','亠','人','儿','入','八','冂','冖','冫','几','凵','刀','力','勹',
  '匕','匚','匸','十','卜','卩','厂','厶','又','口','囗','土','士','夂','夊','夕','大','女','子','宀',
  '寸','小','尢','尸','屮','山','巛','工','己','巾','干','幺','广','廴','廾','弋','弓','彐','彡','彳',
  '心','戈','戶','手','支','攴','文','斗','斤','方','无','日','曰','月','木','欠','止','歹','殳','毋',
  '比','毛','氏','气','水','火','爪','父','爻','爿','片','牙','牛','犬','玄','玉','瓜','瓦','甘','生',
  '用','田','疋','疒','癶','白','皮','皿','目','矛','矢','石','示','禸','禾','穴','立','竹','米','糸',
  '缶','网','羊','羽','老','而','耒','耳','聿','肉','臣','自','至','臼','舌','舛','舟','艮','色','艸',
  '虍','虫','血','行','衣','襾','見','角','言','谷','豆','豕','豸','貝','赤','走','足','身','車','辛',
  '辰','辵','邑','酉','釆','里','金','長','門','阜','隶','隹','雨','青','非','面','革','韋','韭','音',
  '頁','風','飛','食','首','香','馬','骨','高','髟','鬥','鬯','鬲','鬼','魚','鳥','鹵','鹿','麥','麻',
  '黃','黍','黑','黹','黽','鼎','鼓','鼠','鼻','齊','齒','龍','龜','龠'
];

function findExistingFile(dir: string, candidates: string[]): string | null {
  for (const name of candidates) {
    const fullPath = path.join(dir, name);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

async function compileDictionary() {
  if (!fs.existsSync(COMPILED_DIR)) {
    await fsp.mkdir(COMPILED_DIR, { recursive: true });
  }

  const dict: CharDictionary = {};
  console.log(`${CLI_COLORS.cyan}📦 開始編譯字典索引...${CLI_COLORS.reset}`);

  // 1. 解析 Unihan 提取部首
  const radicalCandidates = ['Unihan_RadicalStroke.txt', 'Unihan_Radicals.txt'];
  const radicalPath = findExistingFile(RAW_DIR, radicalCandidates);
  
  if (radicalPath) {
    console.log(`${CLI_COLORS.gray}➡️ 解析 ${path.basename(radicalPath)}...${CLI_COLORS.reset}`);
    const rl = readline.createInterface({ input: fs.createReadStream(radicalPath), crlfDelay: Infinity });
    for await (const line of rl) {
      if (line.startsWith('#') || !line.trim()) continue;
      
      const tabIdx1 = line.indexOf('\t');
      const tabIdx2 = line.indexOf('\t', tabIdx1 + 1);
      if (tabIdx1 === -1 || tabIdx2 === -1) continue;

      const codepoint = line.substring(0, tabIdx1);
      const field = line.substring(tabIdx1 + 1, tabIdx2);
      const value = line.substring(tabIdx2 + 1);
      
      if (field !== 'kRSUnicode' || !value) continue;
      
      const unicode = codepoint.replace('U+', '').padStart(4, '0');
      const radicalNum = parseInt(value.split('.')[0], 10);
      
      if (radicalNum >= 1 && radicalNum <= 214) {
        if (!dict[unicode]) dict[unicode] = { radical: '—', jyutping: [], pinyin: [] };
        dict[unicode].radical = KANGXI_RADICALS[radicalNum - 1];
      }
    }
  } else {
    console.warn(`${CLI_COLORS.yellow}⚠️ 找不到部首檔案，嘗試過：${radicalCandidates.join(', ')}${CLI_COLORS.reset}`);
  }

  // 2. 解析 Unihan 提取普拼
  const readingPath = path.join(RAW_DIR, 'Unihan_Readings.txt');
  if (fs.existsSync(readingPath)) {
    console.log(`${CLI_COLORS.gray}➡️ 解析 Unihan_Readings.txt (普拼)...${CLI_COLORS.reset}`);
    const rl = readline.createInterface({ input: fs.createReadStream(readingPath), crlfDelay: Infinity });
    for await (const line of rl) {
      if (line.startsWith('#') || !line.trim()) continue;
      
      const tabIdx1 = line.indexOf('\t');
      const tabIdx2 = line.indexOf('\t', tabIdx1 + 1);
      if (tabIdx1 === -1 || tabIdx2 === -1) continue;

      const field = line.substring(tabIdx1 + 1, tabIdx2);
      if (field !== 'kMandarin') continue;

      const value = line.substring(tabIdx2 + 1);
      if (value) {
        const codepoint = line.substring(0, tabIdx1);
        const unicode = codepoint.replace('U+', '').padStart(4, '0');
        if (!dict[unicode]) dict[unicode] = { radical: '—', jyutping: [], pinyin: [] };
        
        // 效能優化：使用 Set 避免 O(n) 的 includes 檢查
        const existingPinyin = new Set(dict[unicode].pinyin);
        const pinyins = value.split(' ').filter(Boolean);
        for (const p of pinyins) {
          if (!existingPinyin.has(p)) {
            dict[unicode].pinyin.push(p);
            existingPinyin.add(p);
          }
        }
      }
    }
  } else {
    console.warn(`${CLI_COLORS.yellow}⚠️ 找不到 Unihan_Readings.txt，將跳過普拼解析。${CLI_COLORS.reset}`);
  }

  // 3. 解析 Rime 粵拼 (權重排序演算法)
  const jyutpingPath = path.join(RAW_DIR, 'jyutping.dict.yaml');
  if (fs.existsSync(jyutpingPath)) {
    console.log(`${CLI_COLORS.gray}➡️ 解析 jyutping.dict.yaml...${CLI_COLORS.reset}`);
    const tempDict: Record<string, JyutpingEntry[]> = {};
    const rl = readline.createInterface({ input: fs.createReadStream(jyutpingPath), crlfDelay: Infinity });
    
    for await (const line of rl) {
      if (line.startsWith('#') || line.startsWith('---') || !line.trim()) continue;
      
      const parts = line.split('\t');
      if (parts.length < 2) continue;
      
      const word = parts[0];
      const jyutping = parts[1];
      const weightStr = parts[2] || '0';
      
      // 處理 Surrogate Pairs 代理對 (正確判斷 Unicode 擴充字元長度)
      if (Array.from(word).length !== 1) continue; 
      
      const codePoint = word.codePointAt(0);
      if (!codePoint) continue;
      const unicode = codePoint.toString(16).toUpperCase().padStart(4, '0');
      
      const weight = parseFloat(weightStr.replace('%', '')) || 0;
      
      if (!tempDict[unicode]) tempDict[unicode] = [];
      tempDict[unicode].push({ jyutping, weight });
    }

    for (const [unicode, entries] of Object.entries(tempDict)) {
      if (!dict[unicode]) dict[unicode] = { radical: '—', jyutping: [], pinyin: [] };
      
      // 依權重降冪排序
      entries.sort((a, b) => b.weight - a.weight);
      
      // 效能優化：使用 Set 進行 O(1) 唯一值過濾
      const uniqueSet = new Set<string>();
      const uniqueArray: string[] = [];
      for (const { jyutping } of entries) {
        if (!uniqueSet.has(jyutping)) {
          uniqueSet.add(jyutping);
          uniqueArray.push(jyutping);
        }
      }
      dict[unicode].jyutping = uniqueArray;
    }
  } else {
    console.warn(`${CLI_COLORS.yellow}⚠️ 找不到 jyutping.dict.yaml，將跳過粵拼解析。${CLI_COLORS.reset}`);
  }

  // 非同步寫入，避免阻塞
  await fsp.writeFile(DICT_OUTPUT, JSON.stringify(dict, null, 2), 'utf-8');
  
  // 資料治理覆蓋率統計
  const stats = { total: 0, hasRadical: 0, hasJyutping: 0, hasPinyin: 0, complete: 0 };
  
  for (const entry of Object.values(dict)) {
    stats.total++;
    const hasR = entry.radical !== '—';
    const hasJ = entry.jyutping.length > 0;
    const hasP = entry.pinyin.length > 0;
    
    if (hasR) stats.hasRadical++;
    if (hasJ) stats.hasJyutping++;
    if (hasP) stats.hasPinyin++;
    if (hasR && hasJ && hasP) stats.complete++;
  }

  const getPercentage = (count: number) => stats.total === 0 ? '0.0' : ((count / stats.total) * 100).toFixed(1);

  console.log(`\n${CLI_COLORS.cyan}======================================================${CLI_COLORS.reset}`);
  console.log(`${CLI_COLORS.green}📊 字典編譯與資料覆蓋率統計${CLI_COLORS.reset}`);
  console.log(`${CLI_COLORS.cyan}======================================================${CLI_COLORS.reset}`);
  console.log(` 總收錄字數 : ${stats.total}`);
  console.log(` 有部首     : ${CLI_COLORS.green}${stats.hasRadical}${CLI_COLORS.reset} (${getPercentage(stats.hasRadical)}%)`);
  console.log(` 有粵拼     : ${CLI_COLORS.green}${stats.hasJyutping}${CLI_COLORS.reset} (${getPercentage(stats.hasJyutping)}%)`);
  console.log(` 有普拼     : ${CLI_COLORS.green}${stats.hasPinyin}${CLI_COLORS.reset} (${getPercentage(stats.hasPinyin)}%)`);
  console.log(` 三者齊全   : ${CLI_COLORS.green}${stats.complete}${CLI_COLORS.reset} (${getPercentage(stats.complete)}%)`);
  console.log(`${CLI_COLORS.cyan}======================================================${CLI_COLORS.reset}`);
  console.log(`✅ 字典索引已安全寫入至: ${CLI_COLORS.cyan}${DICT_OUTPUT}${CLI_COLORS.reset}\n`);
}

compileDictionary().catch(err => {
  console.error(`${CLI_COLORS.red}❌ 字典編譯致命錯誤:${CLI_COLORS.reset}`, err);
  process.exit(1);
});

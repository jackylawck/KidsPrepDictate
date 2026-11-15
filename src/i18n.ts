// src/i18n.ts
export type Lang = 'zh' | 'en';

const LANG_STORAGE_KEY = 'kidsprep_lang_v1';

export const DICT = {
  zh: {
    appTitle: '童温默書',
    langBtn: 'EN',
    parentSummary: '📝 家長出題 / 切換模式（點擊展開）',
    btnFreeMode: '✍️ 切換至「無家長自由寫字模式」',
    passagePlaceholder: '貼上整段默書課文（例：牀前明月光，疑是地上霜。）',
    btnStartPassage: '鎖定整段課文並開始默書',
    btnSpeakSentence: '🔊 朗讀段落',
    btnSpeakChar: '🗣️ 讀出當前字',
    btnConfirm: '✅ 確認寫完',
    btnHint: '💡 偷睇筆順',
    btnClear: '🧹 重寫本字',
    btnSkip: '⏭️ 唔識跳過',
    candidateLabel: '選字修正：',
    progressFree: '自由模式：已寫 {done} 字',
    progressStrict: '默書：{done} / {total} 字',
    badgeFree: '自由寫字（已寫 {count} 劃）',
    badgeStrict: '已寫 {current} / 目標 {total} 劃',
    badgeVisualScan: '字形掃描（已寫 {current} 劃）', // 新增：雙引擎字形掃描狀態
    msgEmptyPassage: '請先貼上默書課文！',
    msgCompleted: '🎉 滿分過關！成段默書全部完成！',
    msgCompletedVoice: '好叻呀！成段默書完成啦！',
    msgSkipped: '⏭️ 已跳過「{char}」字（標記為待溫習）',
    msgRestored: '📌 已恢復上次未完成的默書進度（點擊「朗讀段落」聽聲）',
    msgPoolLoading: '⏳ 字庫載入中，請再等一秒...',
    msgFreeNotFound: '❌ 認唔到呢個字，請寫清楚啲再試！',
    msgFreeMatched: '✨ 認到「{char}」字！',
    msgVoiceFallback: 'ℹ️ 裝置未安裝粵語語音，暫用普通話朗讀',
    msgVoiceError: '⚠️ 語音播放失敗，請檢查裝置靜音開關',
    verifyTooSmall: '🔍 寫得太細啦，請喺米字格中間寫大隻啲！',
    verifyFallbackSuccess: '✅ 寫好「{char}」字啦！',
    verifyWrongCount: '❌ 筆畫數差咗啲：「{char}」約 {target} 畫，你寫咗 {user} 畫',
    verifySuccessOrder: '✅ 寫啱咗「{char}」字！',
    verifySuccessUnordered: '✅ 寫啱咗「{char}」字！（留意下筆順會仲靚）',
    verifyWrongShape: '❌ 字形爭少少，再試下或者按「重寫本字」啦！'
  },
  en: {
    appTitle: 'KidsPrepDictate',
    langBtn: '繁中',
    parentSummary: '📝 Parent Setup / Switch Mode (Tap to expand)',
    btnFreeMode: '✍️ Switch to Free-Write Mode (No Setup)',
    passagePlaceholder: 'Paste Chinese passage here (e.g. 牀前明月光，疑是地上霜。)',
    btnStartPassage: 'Lock Passage & Start Dictation',
    btnSpeakSentence: '🔊 Read Passage',
    btnSpeakChar: '🗣️ Read Character',
    btnConfirm: '✅ Done',
    btnHint: '💡 Stroke Hint',
    btnClear: '🧹 Clear',
    btnSkip: '⏭️ Skip',
    candidateLabel: 'Pick:',
    progressFree: 'Free Write: {done} chars',
    progressStrict: 'Progress: {done} / {total}',
    badgeFree: 'Free Write ({count} strokes)',
    badgeStrict: 'Strokes: {current} / {total}',
    badgeVisualScan: 'Glyph Scan ({current} strokes)', // 新增：雙引擎字形掃描狀態
    msgEmptyPassage: 'Please paste a passage first!',
    msgCompleted: '🎉 Awesome! Full passage completed!',
    msgCompletedVoice: '好叻呀！成段默書完成啦！',
    msgSkipped: '⏭️ Skipped "{char}" (marked for review)',
    msgRestored: '📌 Resumed previous session (Tap "Read Passage" to listen)',
    msgPoolLoading: '⏳ Loading dictionary, wait 1 sec...',
    msgFreeNotFound: '❌ Character not recognized, try writing clearer!',
    msgFreeMatched: '✨ Recognized "{char}"!',
    msgVoiceFallback: 'ℹ️ Cantonese voice unavailable, using Mandarin',
    msgVoiceError: '⚠️ Speech failed, check device silent switch',
    verifyTooSmall: '🔍 Too small! Please write larger in the center grid.',
    verifyFallbackSuccess: '✅ Great job writing "{char}"!',
    verifyWrongCount: '❌ Stroke count off: "{char}" has ~{target} strokes, you wrote {user}',
    verifySuccessOrder: '✅ Correct! "{char}"',
    verifySuccessUnordered: '✅ Correct "{char}"! (Watch stroke order next time)',
    verifyWrongShape: '❌ Shape is slightly off, try again or tap Clear!'
  }
} as const;

export type I18nKey = keyof typeof DICT.zh;

let currentLang: Lang = 'zh';

try {
  const saved = localStorage.getItem(LANG_STORAGE_KEY);
  if (saved === 'zh' || saved === 'en') {
    currentLang = saved;
  }
} catch { /* ignore */ }

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch { /* ignore */ }
  document.documentElement.lang = lang === 'zh' ? 'zh-HK' : 'en';
}

export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  let text: string = DICT[currentLang][key] || DICT.zh[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      // 優化：使用 replaceAll 確保同一個變數出現多次時全數替換
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

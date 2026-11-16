// src/i18n.ts
export type Lang = 'zh' | 'en';

const LANG_STORAGE_KEY = 'kidsprep_lang_v1';

export const DICT = {
  zh: {
    appTitle: '童温默書',
    langBtn: 'EN',
    switchLang: '切換至英文介面',
    parentSummary: '📝 家長出題 / 切換模式（點擊展開）',
    subjectZh: '🇭🇰 中文默書',
    subjectEn: '🇬🇧 英文默書',
    sysKbLabel: '允許使用系統鍵盤（高小 / 藍牙鍵盤適用）',
    enFuzzyLabel: '初小寬鬆容錯（差 1 個字母亦算過關並提醒）',
    enHintLevelLabel: '英文提示強度：',
    hintOptFirst: '首字母（a _ _ _ _）',
    hintOptFirstTwo: '前兩字母（a p _ _ _）',
    hintOptFull: '完整單字（apple）',
    btnFreeMode: '✍️ 切換至「無家長自由寫字模式」',
    passagePlaceholder: '貼上默書課文（中文例：牀前明月光 / 英文例：apple, banana, ice cream）',
    btnStartPassage: '鎖定整段課文並開始默書',
    btnSpeakSentence: '🔊 朗讀段落',
    btnSpeakChar: '🗣️ 讀出當前字',
    btnSpeakWord: '🗣️ 正常發音',
    btnSlowListen: '🐢 慢慢聽',
    btnConfirm: '✅ 確認寫完',
    btnHint: '💡 偷睇筆順',
    btnHintEn: '💡 字母提示',
    btnClear: '🧹 重寫本字',
    btnSkip: '⏭️ 唔識跳過',
    candidateLabel: '選字修正：',
    progressFree: '自由模式：已寫 {done} 字',
    progressStrict: '默書：{done} / {total} 字',
    progressEnStrict: '英文默書：{done} / {total} 詞',
    badgeFree: '自由寫字（已寫 {count} 劃）',
    badgeStrict: '已寫 {current} / 目標 {total} 劃',
    badgeVisualScan: '字形掃描（已寫 {current} 劃）',
    msgEmptyPassage: '請先貼上默書課文！',
    msgCompleted: '🎉 滿分過關！成段默書全部完成！',
    msgCompletedVoice: '好叻呀！成段默書完成啦！',
    msgCompletedEnVoice: 'Well done! Dictation completed!',
    msgSkipped: '⏭️ 已跳過「{char}」（標記為待溫習）',
    msgRestored: '📌 已恢復上次未完成的默書進度',
    msgPoolLoading: '⏳ 字庫載入中，請再等一秒...',
    msgFreeNotFound: '❌ 認唔到呢個字，請寫清楚啲再試！',
    msgFreeMatched: '✨ 認到「{char}」字！',
    msgVoiceFallback: 'ℹ️ 裝置未安裝標準語音，暫用後備發音',
    msgVoiceError: '⚠️ 語音播放失敗，請檢查裝置靜音開關',
    verifyTooSmall: '🔍 寫得太細啦，請喺米字格中間寫大隻啲！',
    verifyFallbackSuccess: '✅ 寫好「{char}」字啦！',
    verifyWrongCount: '❌ 筆畫數差咗啲：「{char}」約 {target} 畫，你寫咗 {user} 畫',
    verifySuccessOrder: '✅ 寫啱咗「{char}」字！',
    verifySuccessUnordered: '✅ 寫啱咗「{char}」字！（留意下筆順會仲靚）',
    verifyWrongShape: '❌ 字形爭少少，再試下或者按「重寫本字」啦！',
    enVerifySuccess: '✅ 串啱咗「{word}」！',
    enVerifyFuzzySuccess: '✅ 過關！「{word}」（留意差咗一個字母）',
    enVerifyWrong: '❌ 串法爭少少，再聽多次或者按「字母提示」啦！',
    enSpaceKey: '空格 Space'
  },
  en: {
    appTitle: 'KidsPrepDictate',
    langBtn: '繁中',
    switchLang: 'Switch to Traditional Chinese',
    parentSummary: '📝 Parent Setup / Switch Mode (Tap to expand)',
    subjectZh: '🇭🇰 Chinese',
    subjectEn: '🇬🇧 English',
    sysKbLabel: 'Use System Keyboard (For BT keyboard users)',
    enFuzzyLabel: 'Junior Friendly (±1 letter typo tolerance)',
    enHintLevelLabel: 'English Hint Level:',
    hintOptFirst: 'First Letter (a _ _ _ _)',
    hintOptFirstTwo: 'First 2 Letters (a p _ _ _)',
    hintOptFull: 'Full Word (apple)',
    btnFreeMode: '✍️ Switch to Free-Write Mode (No Setup)',
    passagePlaceholder: 'Paste passage (Chinese: 牀前明月光 / English: apple, banana, ice cream)',
    btnStartPassage: 'Lock Passage & Start Dictation',
    btnSpeakSentence: '🔊 Read Passage',
    btnSpeakChar: '🗣️ Read Character',
    btnSpeakWord: '🗣️ Normal Speed',
    btnSlowListen: '🐢 Slow Listen',
    btnConfirm: '✅ Done',
    btnHint: '💡 Stroke Hint',
    btnHintEn: '💡 Letter Hint',
    btnClear: '🧹 Clear',
    btnSkip: '⏭️ Skip',
    candidateLabel: 'Pick:',
    progressFree: 'Free Write: {done} chars',
    progressStrict: 'Progress: {done} / {total}',
    progressEnStrict: 'English: {done} / {total} words',
    badgeFree: 'Free Write ({count} strokes)',
    badgeStrict: 'Strokes: {current} / {total}',
    badgeVisualScan: 'Glyph Scan ({current} strokes)',
    msgEmptyPassage: 'Please paste a passage first!',
    msgCompleted: '🎉 Awesome! Full passage completed!',
    msgCompletedVoice: 'Well done! Dictation completed!',
    msgCompletedEnVoice: 'Well done! Dictation completed!',
    msgSkipped: '⏭️ Skipped "{char}" (marked for review)',
    msgRestored: '📌 Resumed previous session',
    msgPoolLoading: '⏳ Loading dictionary, wait 1 sec...',
    msgFreeNotFound: '❌ Character not recognized, try writing clearer!',
    msgFreeMatched: '✨ Recognized "{char}"!',
    msgVoiceFallback: 'ℹ️ Standard voice unavailable, using fallback',
    msgVoiceError: '⚠️ Speech failed, check device silent switch',
    verifyTooSmall: '🔍 Too small! Please write larger in the center grid.',
    verifyFallbackSuccess: '✅ Great job writing "{char}"!',
    verifyWrongCount: '❌ Stroke count off: "{char}" has ~{target} strokes, you wrote {user}',
    verifySuccessOrder: '✅ Correct! "{char}"',
    verifySuccessUnordered: '✅ Correct "{char}"! (Watch stroke order next time)',
    verifyWrongShape: '❌ Shape is slightly off, try again or tap Clear!',
    enVerifySuccess: '✅ Correct! "{word}"',
    enVerifyFuzzySuccess: '✅ Passed "{word}"! (Watch 1 letter difference)',
    enVerifyWrong: '❌ Spelling is slightly off, listen again or tap Hint!',
    enSpaceKey: 'Space'
  }
} as const;

export type I18nKey = keyof typeof DICT.zh;

let currentLang: Lang = 'zh';

try {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') {
      currentLang = saved;
    }
  }
} catch { /* ignore */ }

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    }
  } catch { /* ignore */ }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'zh' ? 'zh-HK' : 'en';
  }
}

export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  let text: string = DICT[currentLang][key] || DICT.zh[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}

export function applyI18n(root: ParentNode = document): void {
  if (typeof document === 'undefined') return;

  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n as I18nKey;
    if (key && DICT[currentLang][key]) {
      el.textContent = t(key);
    }
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder as I18nKey;
    if (key && DICT[currentLang][key]) {
      (el as HTMLTextAreaElement).placeholder = t(key);
    }
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((el) => {
    const key = el.dataset.i18nAriaLabel as I18nKey;
    if (key && DICT[currentLang][key]) {
      el.setAttribute('aria-label', t(key));
    }
  });

  const langBtn = document.getElementById('btn-lang-toggle');
  if (langBtn) langBtn.textContent = t('langBtn');
}

export function bindLangToggle(): void {
  if (typeof document === 'undefined') return;

  const btn = document.getElementById('btn-lang-toggle') as HTMLButtonElement | null;
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';

  btn.addEventListener('click', () => {
    setLang(currentLang === 'zh' ? 'en' : 'zh');
    applyI18n();
    window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: currentLang } }));
  });
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = currentLang === 'zh' ? 'zh-HK' : 'en';
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyI18n();
      bindLangToggle();
    });
  } else {
    applyI18n();
    bindLangToggle();
  }
}

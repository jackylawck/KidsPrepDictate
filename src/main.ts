// src/main.ts
import type { DictationToken, Point, StrokeData, VerifyResult } from './types';
import { TraceCanvas } from './ui/canvas-trace';
import { DictationMatcher } from './core/dictation-matcher';
import { EnglishKeyboard } from './ui/english-keyboard';
import { applyI18n, bindLangToggle, t } from './i18n';

const CORE_COMMON_CHARS =
  '一二三四五六七八九十百千萬億零上下左右前後內外中間東西南北高矮長短大小多少快慢早晚午夜晨昏' +
  '日月星辰水火木金土山石田禾雲雨風雪雷電霜霧光影天地海河湖江泉沙泥草花樹木葉果竹林森苗' +
  '人口手足目耳鼻舌牙心頭面眉眼臉髮身體背腹腿腳指掌拳力氣血聲色笑哭看聽說讀寫吃喝玩樂睡醒走跑跳飛游站坐臥' +
  '你我他她它們們誰甚麼哪裡這那的了著過是在有沒無不非可會能要應應該得就都也還又再很太最更真好壞美醜新舊冷熱溫涼乾濕香臭甜苦酸辣鹹' +
  '家爸媽父母爺奶公婆哥弟姐妹叔伯姑姨舅兒子孫男女孩童老少親友鄰居師生同學校長醫生護士警察消防員司機工人農夫' +
  '春夏天秋冬四季年月週日今明昨星期點分秒鐘歲節慶新年中秋端午清明重陽聖誕' +
  '紅橙黃綠青藍紫黑白灰粉褐金銀彩亮暗明清深淺圓方尖平直曲斜正反' +
  '書本紙筆墨硯尺刀擦膠包袋桌椅床牀燈窗門牆屋房廳廚房廁所樓梯電梯公園學校課室操場圖書館醫院商場市場車站機場碼頭' +
  '衣褲鞋襪帽巾錶鏡傘鑰匙電話電腦電視相機球車船飛機火車巴士的士單車' +
  '飯麵麵包餅糖奶水茶果汁湯菜肉魚蛋雞鴨豬牛羊馬狗貓鳥蟲蜂蝶蛙龜兔猴象虎獅熊龍蛇鼠' +
  '愛喜歡想念思希望感謝對不起請再見歡迎幫助關心照顧保護學習練習溫習考試成績進步努力聰明勇敢誠實善良禮貌衛生健康安全快樂幸福' +
  '開關進出上下起落來去回往送迎拿放收發給借還買賣找見遇問答講話告訴通知知道明白記得忘記認識以為覺得相信' +
  '賞疑舉望低故鄉國香港九龍新界中國世界城市街道村莊風景名勝歷史文化科學技術藝術音樂美術體育運動比賽勝利成功失敗';

const STORAGE_KEY = 'kidsprep_session_v2';
type SubjectMode = 'zh' | 'en';
type EnHintLevel = 'first' | 'firstTwo' | 'full';

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Uint16Array(n + 1);
  let curr = new Uint16Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const chA = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = chA === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      curr[j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[n];
}

function initApp() {
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let audioUnlocked = false;

  if (synth) {
    synth.getVoices();
    synth.onvoiceschanged = () => synth.getVoices();
  }

  const unlockAudioEngine = () => {
    if (audioUnlocked || !synth) return;
    try {
      const silent = new SpeechSynthesisUtterance('');
      silent.volume = 0;
      synth.speak(silent);
      audioUnlocked = true;
    } catch { /* ignore */ }
  };

  ['pointerdown', 'touchstart', 'click'].forEach((evt) => {
    document.addEventListener(evt, unlockAudioEngine, { once: true, passive: true });
  });

  const traceCanvas = new TraceCanvas('trace-canvas', 'ink-canvas', 'stroke-badge');

  const parentPanel = document.getElementById('parent-panel') as HTMLDetailsElement;
  const btnFreeMode = document.getElementById('btn-free-mode') as HTMLButtonElement;
  const inputPassage = document.getElementById('input-passage') as HTMLTextAreaElement;
  const btnStartPassage = document.getElementById('btn-start-passage') as HTMLButtonElement;
  const progressPill = document.getElementById('progress-pill') as HTMLElement;

  const enOptionsWrapper = document.getElementById('en-options-wrapper') as HTMLElement;
  const useSysKbCb = document.getElementById('use-sys-kb') as HTMLInputElement;
  const enFuzzyCb = document.getElementById('en-fuzzy-mode') as HTMLInputElement;
  const enHintLevelSelect = document.getElementById('en-hint-level') as HTMLSelectElement;

  const btnSpeakSentence = document.getElementById('btn-speak-sentence') as HTMLButtonElement;
  const btnSpeakChar = document.getElementById('btn-speak-char') as HTMLButtonElement;
  const btnSlowListen = document.getElementById('btn-slow-listen') as HTMLButtonElement;
  const slotsContainer = document.getElementById('sentence-slots') as HTMLElement;
  const feedbackBanner = document.getElementById('feedback-banner') as HTMLElement;
  const candidateBar = document.getElementById('candidate-bar') as HTMLElement;

  const btnConfirmWord = document.getElementById('btn-confirm-word') as HTMLButtonElement;
  const btnHint = document.getElementById('btn-hint') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const btnSkip = document.getElementById('btn-skip') as HTMLButtonElement | null;

  const zhWorkspace = document.getElementById('zh-workspace') as HTMLElement;
  const enWorkspace = document.getElementById('en-workspace') as HTMLElement;
  const enDisplay = document.getElementById('en-display') as HTMLElement;

  let tokens: DictationToken[] = [];
  let currentIndex = 0;
  let fullPassageText = '';
  let isFreeWriteMode = true;
  let currentSubject: SubjectMode = 'zh';
  let loadRequestId = 0;
  let bannerTimer: number | null = null;
  let enHintTimer: number | null = null;
  let isEnHintActive = false;
  let poolReady = false;

  const candidatePool: StrokeData[] = [];
  const charCache = new Map<string, StrokeData>();
  
  const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

  const updateProgressBadge = () => {
    let total = 0;
    let done = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (!tokens[i].isPunctuation) {
        total++;
        if (tokens[i].revealed) done++;
      }
    }

    if (currentSubject === 'en') {
      progressPill.textContent = t('progressEnStrict', { done, total });
    } else if (isFreeWriteMode) {
      progressPill.textContent = t('progressFree', { done });
    } else {
      progressPill.textContent = t('progressStrict', { done, total });
    }
  };

  const shouldShowHintLetter = (idx: number, level: EnHintLevel): boolean => {
    if (!isEnHintActive) return false;
    if (level === 'full') return true;
    if (level === 'firstTwo') return idx < 2;
    return idx === 0;
  };

  const renderEnDisplay = (typed: string) => {
    const targetWord = tokens[currentIndex]?.char || '';
    const level = (enHintLevelSelect?.value as EnHintLevel) || 'first';
    const fragment = document.createDocumentFragment();

    const maxLen = Math.max(typed.length, targetWord.length, 3);
    for (let i = 0; i < maxLen; i++) {
      const targetCh = targetWord[i];
      const typedCh = typed[i];
      const span = document.createElement('span');
      span.className = 'en-char-slot';

      if (typedCh !== undefined) {
        if (typedCh === ' ') {
          span.classList.add('space');
          span.textContent = '\u00A0';
        } else {
          span.textContent = typedCh;
        }
      } else if (targetCh === ' ') {
        span.classList.add('space');
        span.textContent = '\u00A0';
      } else if (targetCh !== undefined && shouldShowHintLetter(i, level)) {
        span.classList.add('hint');
        span.textContent = targetCh;
      } else {
        span.classList.add('empty');
        span.textContent = '_';
      }

      fragment.appendChild(span);
    }

    enDisplay.innerHTML = '';
    enDisplay.appendChild(fragment);
  };

  const englishKeyboard = new EnglishKeyboard('en-keyboard', 'sys-en-input', {
    onChange: (val) => renderEnDisplay(val),
    onSubmit: (val) => verifyEnInput(val)
  });

  const syncSubjectUI = (subject: SubjectMode) => {
    currentSubject = subject;
    const isEn = subject === 'en';

    slotsContainer.classList.toggle('en-mode', isEn);
    enOptionsWrapper.style.display = isEn ? 'flex' : 'none';
    btnFreeMode.style.display = isEn ? 'none' : 'block';
    btnSlowListen.style.display = isEn ? 'inline-block' : 'none';

    btnSpeakChar.dataset.i18n = isEn ? 'btnSpeakWord' : 'btnSpeakChar';
    btnHint.dataset.i18n = isEn ? 'btnHintEn' : 'btnHint';

    zhWorkspace.style.display = isEn ? 'none' : 'block';
    enWorkspace.style.display = isEn ? 'block' : 'none';

    if (isEn) {
      englishKeyboard.setUseSystemKeyboard(Boolean(useSysKbCb?.checked));
    }

    applyI18n();
    updateProgressBadge();
  };

  document.querySelectorAll<HTMLInputElement>('input[name="subject"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        syncSubjectUI(radio.value as SubjectMode);
      }
    });
  });

  useSysKbCb?.addEventListener('change', () => {
    englishKeyboard.setUseSystemKeyboard(useSysKbCb.checked);
  });

  enHintLevelSelect?.addEventListener('change', () => {
    if (currentSubject === 'en' && isEnHintActive) {
      renderEnDisplay(englishKeyboard.getValue());
    }
  });

  window.addEventListener('langchange', () => {
    updateProgressBadge();
    traceCanvas.updateBadge();
    englishKeyboard.updateLocalization();
  });

  const fetchWithTimeout = async (url: string, timeoutMs: number = 3000) => {
    if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
      return fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    }
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  };

  const preloadCandidatePool = async () => {
    const uniqueChars = [...new Set(CORE_COMMON_CHARS)];
    const batchSize = 24;

    for (let i = 0; i < uniqueChars.length; i += batchSize) {
      const batch = uniqueChars.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async (ch) => {
          if (charCache.has(ch)) return;
          const code = ch.codePointAt(0);
          if (!code) return;
          const unicode = code.toString(16).toUpperCase().padStart(4, '0');
          try {
            const res = await fetchWithTimeout(`${baseUrl}/data/${unicode}.json`, 3000);
            if (res.ok) {
              const data: StrokeData = await res.json();
              if (data.medians && data.medians.length > 0 && !charCache.has(ch)) {
                charCache.set(ch, data);
                candidatePool.push(data);
              }
            }
          } catch { /* ignore */ }
        })
      );
      if (candidatePool.length > 0) poolReady = true;
    }
    poolReady = true;
  };

  const showBanner = (msg: string, isError = false) => {
    if (bannerTimer) clearTimeout(bannerTimer);
    feedbackBanner.textContent = msg;
    feedbackBanner.style.display = 'block';
    feedbackBanner.classList.toggle('warning-error', isError);
    bannerTimer = window.setTimeout(() => {
      feedbackBanner.style.display = 'none';
    }, 2400);
  };

  const speakText = (text: string, rate: number = 0.85) => {
    if (!text || !synth) return;
    if (synth.paused) synth.resume();
    if (synth.speaking) synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    const voices = synth.getVoices();

    if (currentSubject === 'en') {
      const gbVoice =
        voices.find((v) => v.lang === 'en-GB' && /daniel|kate|serena|arthur|martha|oliver/i.test(v.name)) ||
        voices.find((v) => v.lang === 'en-GB');
      const usVoice =
        voices.find((v) => v.lang === 'en-US' && /samantha|alex|fred/i.test(v.name)) ||
        voices.find((v) => v.lang === 'en-US');
      const anyEn = voices.find((v) => v.lang.toLowerCase().startsWith('en-'));

      const picked = gbVoice || usVoice || anyEn;
      if (picked) {
        utterance.voice = picked;
        utterance.lang = picked.lang;
      } else {
        utterance.lang = 'en-GB';
      }
    } else {
      const hkVoice = voices.find((v) => /yue|cantonese|hong kong|zh-hk|粵|廣東/i.test(`${v.name} ${v.lang}`));
      const zhFallback = voices.find((v) => /zh-cn|zh-tw|mandarin|cmn|普通|國語/i.test(`${v.lang} ${v.name}`));

      if (hkVoice) {
        utterance.lang = 'zh-HK';
        utterance.voice = hkVoice;
      } else if (zhFallback) {
        utterance.lang = zhFallback.lang;
        utterance.voice = zhFallback;
        if (feedbackBanner.style.display !== 'block') {
          showBanner(t('msgVoiceFallback'));
        }
      } else {
        utterance.lang = 'zh-HK';
      }
    }

    utterance.onerror = () => {
      if (feedbackBanner.style.display !== 'block') {
        showBanner(t('msgVoiceError'), true);
      }
    };

    synth.speak(utterance);
  };

  const saveSessionProgress = () => {
    if (isFreeWriteMode || !fullPassageText) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          passage: fullPassageText,
          tokens,
          currentIndex,
          subject: currentSubject,
          timestamp: Date.now()
        })
      );
    } catch { /* ignore */ }
  };

  const renderSlots = () => {
    updateProgressBadge();
    let activeEl: HTMLElement | null = null;
    const fragment = document.createDocumentFragment();

    tokens.forEach((token, idx) => {
      const div = document.createElement('div');
      div.className = 'char-slot';

      if (token.isPunctuation) {
        div.classList.add('punctuation');
        div.textContent = token.char;
      } else if (token.revealed) {
        div.classList.add('revealed');
        if (token.skipped) div.style.opacity = '0.68';
        div.textContent = token.char;
      } else if (idx === currentIndex) {
        div.classList.add('active');
        div.textContent = '✍️';
        activeEl = div;
      }

      fragment.appendChild(div);
    });

    slotsContainer.innerHTML = '';
    slotsContainer.appendChild(fragment);

    if (activeEl) {
      const targetEl = activeEl as HTMLElement;
      requestAnimationFrame(() => {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  };

  const renderCandidateBar = (candidates: string[], targetSlotIdx: number) => {
    if (!isFreeWriteMode || currentSubject !== 'zh' || candidates.length === 0) {
      candidateBar.style.display = 'none';
      return;
    }

    const fragment = document.createDocumentFragment();
    const labelSpan = document.createElement('span');
    labelSpan.style.cssText = 'font-size:0.8rem;color:#666;align-self:center;';
    labelSpan.textContent = t('candidateLabel');
    fragment.appendChild(labelSpan);

    candidates.forEach((ch) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = ch;
      btn.style.cssText =
        'padding:4px 10px;border:1px solid #00796b;border-radius:6px;background:#e0f2f1;font-weight:bold;font-size:1.1rem;cursor:pointer;';
      btn.addEventListener('click', () => {
        if (tokens[targetSlotIdx]) {
          tokens[targetSlotIdx].char = ch;
          renderSlots();
          speakText(ch, 0.85);
          candidateBar.style.display = 'none';
        }
      });
      fragment.appendChild(btn);
    });

    candidateBar.innerHTML = '';
    candidateBar.appendChild(fragment);
    candidateBar.style.display = 'flex';
  };

  const loadCurrentTarget = async (autoSpeakEn: boolean = true) => {
    const reqId = ++loadRequestId;

    while (currentIndex < tokens.length && tokens[currentIndex].isPunctuation) {
      tokens[currentIndex].revealed = true;
      currentIndex++;
    }

    if (isFreeWriteMode && currentSubject === 'zh' && currentIndex >= tokens.length) {
      tokens.push(...Array.from({ length: 10 }, () => ({ char: '', isPunctuation: false, revealed: false })));
    }

    renderSlots();
    saveSessionProgress();

    if (!isFreeWriteMode && currentIndex >= tokens.length) {
      localStorage.removeItem(STORAGE_KEY);
      
      // 🚀 優化 1：徹底收尾，防止過關後繼續畫畫
      traceCanvas.clearInk();
      // 如果 traceCanvas 在未來實作了鎖定，可以解除下面這行註解：
      // if (typeof traceCanvas.lock === 'function') traceCanvas.lock();
      
      btnHint.style.display = 'none';
      btnSpeakChar.style.display = 'none';
      btnConfirmWord.style.display = 'none';
      btnClear.style.display = 'none';
      if (btnSkip) btnSkip.style.display = 'none';
      
      showBanner(t('msgCompleted'));
      speakText(currentSubject === 'en' ? t('msgCompletedEnVoice') : t('msgCompletedVoice'), 0.85);
      return;
    }
    
    // 確保未過關時操作按鈕有正常顯示
    if (!isFreeWriteMode) {
      btnHint.style.display = 'inline-block';
      btnSpeakChar.style.display = 'inline-block';
      btnConfirmWord.style.display = 'inline-block';
      btnClear.style.display = 'inline-block';
      if (btnSkip) btnSkip.style.display = 'inline-block';
    }

    if (currentSubject === 'en') {
      if (enHintTimer) clearTimeout(enHintTimer);
      isEnHintActive = false;
      const targetWord = tokens[currentIndex]?.char || '';
      englishKeyboard.setMaxLength(Math.max(targetWord.length + 4, 24));
      englishKeyboard.clear();
      renderEnDisplay('');
      if (targetWord && autoSpeakEn) {
        speakText(targetWord, 0.85);
      }
      return;
    }

    if (isFreeWriteMode) {
      traceCanvas.enterFreeWriteMode();
      return;
    }

    const targetChar = tokens[currentIndex].char;
    if (charCache.has(targetChar)) {
      traceCanvas.loadDictationTarget(charCache.get(targetChar)!);
      return;
    }

    const code = targetChar.codePointAt(0);
    if (!code) return;
    const unicode = code.toString(16).toUpperCase().padStart(4, '0');

    try {
      const res = await fetchWithTimeout(`${baseUrl}/data/${unicode}.json`, 3000);
      if (reqId !== loadRequestId) return;
      if (!res.ok) throw new Error('Not found');
      const data: StrokeData = await res.json();
      if (reqId !== loadRequestId) return;

      charCache.set(targetChar, data);
      traceCanvas.loadDictationTarget(data);
    } catch {
      if (reqId !== loadRequestId) return;
      traceCanvas.loadDictationTarget({ char: targetChar, unicode, totalStrokes: 0, strokes: [], medians: [] });
    }
  };

  const verifyEnInput = (rawTyped: string) => {
    if (currentSubject !== 'en' || isFreeWriteMode || currentIndex >= tokens.length) return;

    const targetWord = tokens[currentIndex].char.trim();
    const typedClean = rawTyped.trim().replace(/\s+/g, ' ').toLowerCase();
    const targetLower = targetWord.toLowerCase();

    if (!typedClean) {
      showBanner(t('enVerifyWrong'), true);
      return;
    }

    const isExact = typedClean === targetLower;
    const isFuzzyAllowed = Boolean(enFuzzyCb?.checked);
    const dist = levenshtein(typedClean, targetLower);
    const isFuzzyPass = !isExact && isFuzzyAllowed && targetLower.length >= 3 && dist === 1;

    if (isExact || isFuzzyPass) {
      if (navigator.vibrate) navigator.vibrate(25);
      tokens[currentIndex].revealed = true;
      showBanner(
        isExact
          ? t('enVerifySuccess', { word: targetWord })
          : t('enVerifyFuzzySuccess', { word: targetWord })
      );
      currentIndex++;
      loadCurrentTarget(true);
      return;
    }

    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    showBanner(t('enVerifyWrong'), true);
  };

  const handleStrictResult = (result: VerifyResult) => {
    if (currentIndex >= tokens.length) return;
    const localizedMsg = result.message;

    if (result.status === 'SUCCESS') {
      const doneChar = tokens[currentIndex].char;
      if (navigator.vibrate) navigator.vibrate(25);
      tokens[currentIndex].revealed = true;

      if (result.isFallback || result.score === 0.8) {
        tokens[currentIndex].skipped = true;
      }

      showBanner(localizedMsg);
      currentIndex++;
      speakText(doneChar, 0.85);
      loadCurrentTarget();
      return;
    }

    const isUnderStroke =
      result.status === 'WRONG_STROKE_COUNT' &&
      traceCanvas.getUserStrokeCount() < traceCanvas.getTargetStrokeCount();

    showBanner(localizedMsg, true);
    if (!isUnderStroke) {
      traceCanvas.scheduleFailClear(950);
    }
  };

  const handleFreeRecognize = (strokes: Point[][]) => {
    candidateBar.style.display = 'none';
    if (currentIndex >= tokens.length) return;

    if (!poolReady && candidatePool.length === 0) {
      showBanner(t('msgPoolLoading'), false);
      traceCanvas.scheduleFailClear(1200);
      return;
    }

    const candidates = DictationMatcher.recognizeTopCandidates(strokes, candidatePool, 5);
    if (candidates.length === 0) {
      showBanner(t('msgFreeNotFound'), true);
      traceCanvas.scheduleFailClear(900);
      return;
    }

    if (navigator.vibrate) navigator.vibrate(20);
    const bestMatch = candidates[0];
    const writtenSlotIdx = currentIndex;
    tokens[writtenSlotIdx].char = bestMatch;
    tokens[writtenSlotIdx].revealed = true;

    renderCandidateBar(candidates, writtenSlotIdx);
    showBanner(t('msgFreeMatched', { char: bestMatch }));
    speakText(bestMatch, 0.85);

    currentIndex++;
    loadCurrentTarget();
  };

  traceCanvas.setCallbacks(handleStrictResult, handleFreeRecognize);

  const startFreeMode = () => {
    // 🚀 優化 3：重新啟動時解鎖按鈕
    btnConfirmWord.style.display = 'inline-block';
    btnClear.style.display = 'inline-block';
    // 如果 traceCanvas 有實作 unlock，可以解除下面這行註解：
    // if (typeof traceCanvas.unlock === 'function') traceCanvas.unlock();

    const zhRadio = document.querySelector<HTMLInputElement>('input[name="subject"][value="zh"]');
    if (zhRadio) zhRadio.checked = true;
    syncSubjectUI('zh');

    isFreeWriteMode = true;
    fullPassageText = '';
    inputPassage.value = '';
    parentPanel.open = false;
    btnHint.style.display = 'none';
    btnSpeakChar.style.display = 'none';
    if (btnSkip) btnSkip.style.display = 'none';
    candidateBar.style.display = 'none';

    tokens = Array.from({ length: 20 }, () => ({
      char: '',
      isPunctuation: false,
      revealed: false
    }));
    currentIndex = 0;
    loadCurrentTarget(false);
  };

  const startPassageDictation = (rawText: string, shouldSpeak: boolean = true) => {
    const raw = rawText.trim();
    if (!raw) {
      showBanner(t('msgEmptyPassage'), true);
      return;
    }

    // 🚀 優化 3：重新啟動時解鎖按鈕
    btnConfirmWord.style.display = 'inline-block';
    btnClear.style.display = 'inline-block';
    // 如果 traceCanvas 有實作 unlock，可以解除下面這行註解：
    // if (typeof traceCanvas.unlock === 'function') traceCanvas.unlock();

    const selectedRadio = document.querySelector<HTMLInputElement>('input[name="subject"]:checked');
    const chosenSubject = (selectedRadio?.value as SubjectMode) || currentSubject;
    syncSubjectUI(chosenSubject);

    isFreeWriteMode = false;
    fullPassageText = raw;
    parentPanel.open = false;

    btnHint.style.display = 'inline-block';
    btnSpeakChar.style.display = 'inline-block';
    if (btnSkip) btnSkip.style.display = 'inline-block';
    candidateBar.style.display = 'none';

    if (chosenSubject === 'en') {
      tokens = raw
        .split(/[,，\n\r]+/)
        .map((w) => w.trim().replace(/\s+/g, ' '))
        .filter((w) => w.length > 0)
        .map((word) => ({
          char: word,
          isPunctuation: false,
          revealed: false
        }));
    } else {
      const punctRegex = /[，。！？、；：「」『』（）\n\r\s,.!?;:'"()]/;
      tokens = Array.from(raw)
        .filter((ch) => ch !== '\n' && ch !== '\r')
        .map((ch) => ({
          char: ch,
          isPunctuation: punctRegex.test(ch),
          revealed: punctRegex.test(ch)
        }));
    }

    currentIndex = 0;
    loadCurrentTarget(shouldSpeak);
    if (shouldSpeak && chosenSubject === 'zh') {
      speakText(fullPassageText, 0.85);
    }
  };

  btnConfirmWord.addEventListener('click', () => {
    if (currentSubject === 'en') {
      verifyEnInput(englishKeyboard.getValue());
    } else {
      traceCanvas.triggerVerificationNow();
    }
  });

  btnFreeMode.addEventListener('click', startFreeMode);
  btnStartPassage.addEventListener('click', () => startPassageDictation(inputPassage.value, true));

  btnSpeakSentence.addEventListener('click', () => {
    if (isFreeWriteMode) {
      const writtenText = tokens.filter((item) => item.revealed).map((item) => item.char).join('');
      if (writtenText) speakText(writtenText, 0.85);
    } else {
      speakText(fullPassageText, 0.85);
    }
  });

  btnSpeakChar.addEventListener('click', () => {
    if (!isFreeWriteMode && currentIndex < tokens.length) {
      speakText(tokens[currentIndex].char, 0.85);
    }
  });

  btnSlowListen.addEventListener('click', () => {
    if (currentSubject === 'en' && !isFreeWriteMode && currentIndex < tokens.length) {
      speakText(tokens[currentIndex].char, 0.55);
    }
  });

  btnHint.addEventListener('click', () => {
    if (currentSubject === 'en') {
      if (enHintTimer) clearTimeout(enHintTimer);
      isEnHintActive = true;
      renderEnDisplay(englishKeyboard.getValue());
      enHintTimer = window.setTimeout(() => {
        isEnHintActive = false;
        renderEnDisplay(englishKeyboard.getValue());
      }, 1800);
    } else {
      traceCanvas.flashHint(1800);
    }
  });

  btnClear.addEventListener('click', () => {
    if (currentSubject === 'en') {
      englishKeyboard.clear();
    } else {
      traceCanvas.clearInk();
    }
  });

  if (btnSkip) {
    btnSkip.addEventListener('click', () => {
      if (isFreeWriteMode || currentIndex >= tokens.length) return;
      const skippedChar = tokens[currentIndex].char;
      tokens[currentIndex].revealed = true;
      tokens[currentIndex].skipped = true;
      showBanner(t('msgSkipped', { char: skippedChar }));

      if (currentSubject === 'en') {
        englishKeyboard.clear();
      } else {
        traceCanvas.clearInk();
      }

      currentIndex++;
      loadCurrentTarget(true);
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveSessionProgress();
    }
  });

  window.addEventListener('pagehide', () => {
    saveSessionProgress();
    traceCanvas.destroy();
  });

  const checkSavedSession = () => {
    try {
      const rawSaved = localStorage.getItem(STORAGE_KEY);
      if (rawSaved) {
        const parsed = JSON.parse(rawSaved);
        if (
          parsed.passage &&
          Array.isArray(parsed.tokens) &&
          typeof parsed.currentIndex === 'number' &&
          parsed.currentIndex >= 0 &&
          parsed.currentIndex < parsed.tokens.length
        ) {
          const savedSubject: SubjectMode = parsed.subject === 'en' ? 'en' : 'zh';
          const radio = document.querySelector<HTMLInputElement>(`input[name="subject"][value="${savedSubject}"]`);
          if (radio) radio.checked = true;
          syncSubjectUI(savedSubject);

          isFreeWriteMode = false;
          fullPassageText = parsed.passage;
          inputPassage.value = parsed.passage;
          tokens = parsed.tokens;
          currentIndex = parsed.currentIndex;

          btnHint.style.display = 'inline-block';
          btnSpeakChar.style.display = 'inline-block';
          if (btnSkip) btnSkip.style.display = 'inline-block';

          loadCurrentTarget(false);
          showBanner(t('msgRestored'));
          return;
        }
      }
    } catch { /* ignore */ }

    startFreeMode();
  };

  applyI18n();
  bindLangToggle();
  preloadCandidatePool();
  checkSavedSession();
}

window.addEventListener('DOMContentLoaded', initApp);

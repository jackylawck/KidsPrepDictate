// src/main.ts
import type { DictationToken, Point, StrokeData, VerifyResult } from './types';
import { TraceCanvas } from './ui/canvas-trace';
import { DictationMatcher } from './core/dictation-matcher';
import { getLang, setLang, t, type I18nKey } from './i18n';

// 自由模式備用字庫：無須預先 fetch，視覺引擎會即時利用系統字型渲染
const CORE_COMMON_CHARS =
  '一二三四五六七八九十人口手目耳日月水火木金土山石田禾上下大小多少左右前後中出入來去你我他她的是在有和不這那好愛家爸媽哥弟姐妹老師同學朋友春夏天秋風雨花草樹木鳥魚心手足頭面眉眼鼻口書筆紙床牀光疑地霜舉望低思故鄉';

const STORAGE_KEY = 'kidsprep_session_v2';

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
  document.addEventListener('pointerdown', unlockAudioEngine, { once: true });

  const traceCanvas = new TraceCanvas('trace-canvas', 'ink-canvas', 'stroke-badge');

  const btnLangToggle = document.getElementById('btn-lang-toggle') as HTMLButtonElement;
  const parentPanel = document.getElementById('parent-panel') as HTMLDetailsElement;
  const btnFreeMode = document.getElementById('btn-free-mode') as HTMLButtonElement;
  const inputPassage = document.getElementById('input-passage') as HTMLTextAreaElement;
  const btnStartPassage = document.getElementById('btn-start-passage') as HTMLButtonElement;
  const progressPill = document.getElementById('progress-pill') as HTMLElement;

  const btnSpeakSentence = document.getElementById('btn-speak-sentence') as HTMLButtonElement;
  const btnSpeakChar = document.getElementById('btn-speak-char') as HTMLButtonElement;
  const slotsContainer = document.getElementById('sentence-slots') as HTMLElement;
  const feedbackBanner = document.getElementById('feedback-banner') as HTMLElement;
  const candidateBar = document.getElementById('candidate-bar') as HTMLElement;

  const btnConfirmWord = document.getElementById('btn-confirm-word') as HTMLButtonElement;
  const btnHint = document.getElementById('btn-hint') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const btnSkip = document.getElementById('btn-skip') as HTMLButtonElement;

  let tokens: DictationToken[] = [];
  let currentIndex = 0;
  let fullPassageText = '';
  let isFreeWriteMode = true;
  let loadRequestId = 0;
  let bannerTimer: number | null = null;
  let poolReady = false;

  const candidatePool: StrokeData[] = [];
  const charCache = new Map<string, StrokeData>();
  const baseUrl = import.meta.env.BASE_URL || '/';

  const updateProgressBadge = () => {
    const totalChars = tokens.filter(t => !t.isPunctuation).length;
    const doneChars = tokens.filter(t => !t.isPunctuation && t.revealed).length;
    progressPill.textContent = isFreeWriteMode
      ? t('progressFree', { done: doneChars })
      : t('progressStrict', { done: doneChars, total: totalChars });
  };

  const applyLocalization = () => {
    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n as I18nKey;
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
      const key = el.dataset.i18nPlaceholder as I18nKey;
      if (key) el.placeholder = t(key);
    });
    btnLangToggle.textContent = t('langBtn');
    updateProgressBadge();
    traceCanvas.updateBadge();
  };

  btnLangToggle.addEventListener('click', () => {
    setLang(getLang() === 'zh' ? 'en' : 'zh');
    applyLocalization();
  });

  const fetchWithTimeout = async (url: string, timeoutMs: number = 3000) => {
    if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
      return fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    }
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  };

  // 優化 1：直接建立基礎字元集索引，無需等待外部 JSON，實現 0 毫秒冷啟動
  const preloadCandidatePool = async () => {
    const uniqueChars = Array.from(new Set(Array.from(CORE_COMMON_CHARS)));
    for (const ch of uniqueChars) {
      const code = ch.codePointAt(0);
      if (!code) continue;
      const unicode = code.toString(16).toUpperCase().padStart(4, '0');
      candidatePool.push({
        char: ch,
        unicode,
        totalStrokes: 0,
        strokes: [],
        medians: []
      });
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

  const speakCantonese = (text: string) => {
    if (!text || !synth) return;
    if (synth.speaking) synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;

    const voices = synth.getVoices();
    const hkVoice = voices.find(v => /yue|cantonese|hong kong|zh-hk|粵|廣東/i.test(v.name + ' ' + v.lang));
    const zhFallback = voices.find(v => /zh-cn|zh-tw|mandarin|cmn|普通|國語/i.test(v.lang + ' ' + v.name));

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        passage: fullPassageText,
        tokens,
        currentIndex,
        timestamp: Date.now()
      }));
    } catch { /* ignore */ }
  };

  const renderSlots = () => {
    updateProgressBadge();
    let activeEl: HTMLElement | null = null;

    if (slotsContainer.children.length === tokens.length) {
      tokens.forEach((token, idx) => {
        const div = slotsContainer.children[idx] as HTMLElement;
        div.className = 'char-slot';
        div.style.opacity = '1';
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
        } else {
          div.textContent = '';
        }
      });
    } else {
      slotsContainer.innerHTML = '';
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
        slotsContainer.appendChild(div);
      });
    }

    if (activeEl) {
      (activeEl as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const renderCandidateBar = (candidates: string[], targetSlotIdx: number) => {
    if (!isFreeWriteMode || candidates.length === 0) {
      candidateBar.style.display = 'none';
      return;
    }
    candidateBar.style.display = 'flex';
    candidateBar.innerHTML = `<span style="font-size:0.8rem;color:#666;align-self:center;">${t('candidateLabel')}</span>`;

    candidates.forEach(ch => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = ch;
      btn.style.cssText = 'padding:4px 10px;border:1px solid #00796b;border-radius:6px;background:#e0f2f1;font-weight:bold;font-size:1.1rem;cursor:pointer;';
      btn.addEventListener('click', () => {
        if (tokens[targetSlotIdx]) {
          tokens[targetSlotIdx].char = ch;
          renderSlots();
          speakCantonese(ch);
          candidateBar.style.display = 'none';
        }
      });
      candidateBar.appendChild(btn);
    });
  };

  const loadCurrentTarget = async () => {
    const reqId = ++loadRequestId;

    while (currentIndex < tokens.length && tokens[currentIndex].isPunctuation) {
      tokens[currentIndex].revealed = true;
      currentIndex++;
    }

    if (isFreeWriteMode && currentIndex >= tokens.length) {
      tokens.push(...Array.from({ length: 10 }, () => ({ char: '', isPunctuation: false, revealed: false })));
    }

    renderSlots();
    saveSessionProgress();

    if (!isFreeWriteMode && currentIndex >= tokens.length) {
      localStorage.removeItem(STORAGE_KEY);
      showBanner(t('msgCompleted'));
      speakCantonese(t('msgCompletedVoice'));
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
      const res = await fetchWithTimeout(`${baseUrl}data/${unicode}.json`, 3000);
      if (reqId !== loadRequestId) return;
      
      if (!res.ok) {
        // 優化 2：遇到 JSON 404 時不報錯，直接構造空資料庫交給視覺掃描引擎
        const fallbackData: StrokeData = { char: targetChar, unicode, totalStrokes: 0, strokes: [], medians: [] };
        charCache.set(targetChar, fallbackData);
        traceCanvas.loadDictationTarget(fallbackData);
        return;
      }
      
      const data: StrokeData = await res.json();
      if (reqId !== loadRequestId) return;

      charCache.set(targetChar, data);
      traceCanvas.loadDictationTarget(data);
    } catch {
      if (reqId !== loadRequestId) return;
      const fallbackData: StrokeData = { char: targetChar, unicode, totalStrokes: 0, strokes: [], medians: [] };
      charCache.set(targetChar, fallbackData);
      traceCanvas.loadDictationTarget(fallbackData);
    }
  };

  const handleStrictResult = (result: VerifyResult) => {
    if (currentIndex >= tokens.length) return;
    const localizedMsg = result.i18nKey ? t(result.i18nKey, result.meta) : result.message;

    if (result.status === 'SUCCESS') {
      const doneChar = tokens[currentIndex].char;
      if (navigator.vibrate) navigator.vibrate(25);
      tokens[currentIndex].revealed = true;

      if (result.i18nKey === 'verifyFallbackSuccess') {
        tokens[currentIndex].skipped = true;
      }

      showBanner(localizedMsg);
      currentIndex++;
      speakCantonese(doneChar);
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
    speakCantonese(bestMatch);

    currentIndex++;
    loadCurrentTarget();
  };

  traceCanvas.setCallbacks(handleStrictResult, handleFreeRecognize);

  const startFreeMode = () => {
    isFreeWriteMode = true;
    fullPassageText = '';
    inputPassage.value = '';
    parentPanel.open = false;
    btnHint.style.display = 'none';
    btnSpeakChar.style.display = 'none';
    btnSkip.style.display = 'none';
    candidateBar.style.display = 'none';

    tokens = Array.from({ length: 20 }, () => ({
      char: '',
      isPunctuation: false,
      revealed: false
    }));
    currentIndex = 0;
    loadCurrentTarget();
  };

  const startPassageDictation = (rawText: string, shouldSpeak: boolean = true) => {
    const raw = rawText.trim();
    if (!raw) {
      showBanner(t('msgEmptyPassage'), true);
      return;
    }
    isFreeWriteMode = false;
    fullPassageText = raw;

    parentPanel.open = false;
    btnHint.style.display = 'inline-block';
    btnSpeakChar.style.display = 'inline-block';
    btnSkip.style.display = 'inline-block';
    candidateBar.style.display = 'none';

    const punctRegex = /[，。！？、；：「」『』（）\n\r\s,.!?;:'"()]/;
    tokens = Array.from(raw)
      .filter(ch => ch !== '\n' && ch !== '\r')
      .map(ch => ({
        char: ch,
        isPunctuation: punctRegex.test(ch),
        revealed: punctRegex.test(ch)
      }));

    currentIndex = 0;
    loadCurrentTarget();
    if (shouldSpeak) speakCantonese(fullPassageText);
  };

  btnConfirmWord.addEventListener('click', () => {
    traceCanvas.triggerVerificationNow();
  });

  btnFreeMode.addEventListener('click', startFreeMode);
  btnStartPassage.addEventListener('click', () => startPassageDictation(inputPassage.value, true));

  btnSpeakSentence.addEventListener('click', () => {
    if (isFreeWriteMode) {
      const writtenText = tokens.filter(t => t.revealed).map(t => t.char).join('');
      if (writtenText) speakCantonese(writtenText);
    } else {
      speakCantonese(fullPassageText);
    }
  });

  btnSpeakChar.addEventListener('click', () => {
    if (!isFreeWriteMode && currentIndex < tokens.length) {
      speakCantonese(tokens[currentIndex].char);
    }
  });

  btnHint.addEventListener('click', () => traceCanvas.flashHint(1800));
  btnClear.addEventListener('click', () => traceCanvas.clearInk());

  btnSkip.addEventListener('click', () => {
    if (isFreeWriteMode || currentIndex >= tokens.length) return;
    const skippedChar = tokens[currentIndex].char;
    tokens[currentIndex].revealed = true;
    tokens[currentIndex].skipped = true;
    showBanner(t('msgSkipped', { char: skippedChar }));
    traceCanvas.clearInk();
    currentIndex++;
    loadCurrentTarget();
  });

  const checkSavedSession = () => {
    try {
      const rawSaved = localStorage.getItem(STORAGE_KEY);
      if (rawSaved) {
        const parsed = JSON.parse(rawSaved);
        if (parsed.passage && Array.isArray(parsed.tokens) && parsed.currentIndex < parsed.tokens.length) {
          isFreeWriteMode = false;
          fullPassageText = parsed.passage;
          inputPassage.value = parsed.passage;
          tokens = parsed.tokens;
          currentIndex = parsed.currentIndex;
          btnHint.style.display = 'inline-block';
          btnSpeakChar.style.display = 'inline-block';
          btnSkip.style.display = 'inline-block';
          loadCurrentTarget();
          showBanner(t('msgRestored'));
          return;
        }
      }
    } catch { /* ignore */ }

    startFreeMode();
  };

  applyLocalization();
  preloadCandidatePool();
  checkSavedSession();
}

window.addEventListener('DOMContentLoaded', initApp);

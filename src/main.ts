// src/main.ts
import type { DictationToken, Point, StrokeData, VerifyResult } from './types';
import { TraceCanvas } from './ui/canvas-trace';
import { DictationMatcher } from './core/dictation-matcher';

// 精簡 72 個香港初小最高頻基礎字，確保冷啟動極速完成
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

  // 帶超時保護的 fetch 封裝（兼容新舊 iPad）
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

  const preloadCandidatePool = async () => {
    const uniqueChars = Array.from(new Set(Array.from(CORE_COMMON_CHARS)));
    await Promise.allSettled(
      uniqueChars.map(async (ch) => {
        const code = ch.codePointAt(0);
        if (!code) return;
        const unicode = code.toString(16).toUpperCase().padStart(4, '0');
        try {
          const res = await fetchWithTimeout(`${baseUrl}data/${unicode}.json`, 3000);
          if (res.ok) {
            const data: StrokeData = await res.json();
            if (data.medians && data.medians.length > 0) {
              charCache.set(ch, data);
              candidatePool.push(data);
            }
          }
        } catch { /* ignore timeouts */ }
      })
    );
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
        showBanner('ℹ️ 裝置未安裝粵語語音，暫用普通話朗讀');
      }
    } else {
      utterance.lang = 'zh-HK';
    }

    utterance.onerror = () => {
      if (feedbackBanner.style.display !== 'block') {
        showBanner('⚠️ 語音播放失敗，請檢查裝置靜音開關', true);
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

  const updateProgressBadge = () => {
    const totalChars = tokens.filter(t => !t.isPunctuation).length;
    const doneChars = tokens.filter(t => !t.isPunctuation && t.revealed).length;
    progressPill.textContent = isFreeWriteMode
      ? `無家長自由模式：已寫 ${doneChars} 字`
      : `嚴格默書：${doneChars} / ${totalChars} 字`;
  };

  // DOM 增量渲染，防止長課文整塊重繪閃爍
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
    candidateBar.innerHTML = '<span style="font-size:0.8rem;color:#666;align-self:center;">選字修正：</span>';

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
      showBanner('🎉 滿分過關！成段默書全部筆畫正確！');
      speakCantonese('好叻呀！成段默書完成啦！');
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

  const handleStrictResult = (result: VerifyResult) => {
    if (currentIndex >= tokens.length) return;

    if (result.status === 'SUCCESS') {
      const doneChar = tokens[currentIndex].char;
      if (navigator.vibrate) navigator.vibrate(25);
      tokens[currentIndex].revealed = true;
      
      // 缺字友善放行標記為半透明，家長一眼即知
      if (result.score === 0.8 && result.message.includes('寫好')) {
        tokens[currentIndex].skipped = true;
      }
      
      showBanner(result.message);
      currentIndex++;
      speakCantonese(doneChar);
      loadCurrentTarget();
      return;
    }

    const isUnderStroke =
      result.status === 'WRONG_STROKE_COUNT' &&
      traceCanvas.getUserStrokeCount() < traceCanvas.getTargetStrokeCount();

    showBanner(result.message, true);
    if (!isUnderStroke) {
      traceCanvas.scheduleFailClear(950);
    }
  };

  const handleFreeRecognize = (strokes: Point[][]) => {
    candidateBar.style.display = 'none';
    if (currentIndex >= tokens.length) return;

    if (!poolReady && candidatePool.length === 0) {
      showBanner('⏳ 字庫載入中，請再等一秒...', false);
      traceCanvas.scheduleFailClear(1200);
      return;
    }

    const candidates = DictationMatcher.recognizeTopCandidates(strokes, candidatePool, 5);
    if (candidates.length === 0) {
      showBanner('❌ 認唔到呢個字，請寫清楚啲再試！', true);
      traceCanvas.scheduleFailClear(900);
      return;
    }

    if (navigator.vibrate) navigator.vibrate(20);
    const bestMatch = candidates[0];
    const writtenSlotIdx = currentIndex;
    tokens[writtenSlotIdx].char = bestMatch;
    tokens[writtenSlotIdx].revealed = true;

    renderCandidateBar(candidates, writtenSlotIdx);
    showBanner(`✨ 認到「${bestMatch}」字！`);
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
      showBanner('請先貼上默書課文！', true);
      return;
    }
    isFreeWriteMode = false;
    fullPassageText = raw;

    // 保留 inputPassage.value 方便家長隨時修改
    parentPanel.open = false;
    btnHint.style.display = 'inline-block';
    btnSpeakChar.style.display = 'inline-block';
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

  const checkSavedSession = () => {
    try {
      const rawSaved = localStorage.getItem(STORAGE_KEY);
      if (rawSaved) {
        const parsed = JSON.parse(rawSaved);
        if (parsed.passage && Array.isArray(parsed.tokens) && parsed.currentIndex < parsed.tokens.length) {
          isFreeWriteMode = false;
          fullPassageText = parsed.passage;
          inputPassage.value = parsed.passage; // 恢復時同步還原家長輸入框內容
          tokens = parsed.tokens;
          currentIndex = parsed.currentIndex;
          btnHint.style.display = 'inline-block';
          btnSpeakChar.style.display = 'inline-block';
          loadCurrentTarget();
          showBanner('📌 已恢復上次未完成的默書進度（點擊「朗讀段落」聽聲）');
          return;
        }
      }
    } catch { /* ignore */ }

    startFreeMode();
  };

  preloadCandidatePool();
  checkSavedSession();
}

window.addEventListener('DOMContentLoaded', initApp);
